import type {
  ZoteroAttachment,
  ZoteroAttachmentLinkMode,
  ZoteroCollection,
  ZoteroCollectionRef,
  ZoteroConnectionStatus,
  ZoteroCreator,
  ZoteroItemDetails,
  ZoteroItemPage,
  ZoteroPageRequest,
  ZoteroItemRef,
  ZoteroItemSummary,
  ZoteroLibraryRef,
  ZoteroPdfAvailability,
  ZoteroPdfStorageMode,
  ZoteroServerIdentity,
} from '../../shared/contracts/zotero';
import { connectionErrorToBridgeError, ZoteroBridgeError } from './zotero-errors';
import type {
  RawZoteroCollection,
  RawZoteroItem,
  ZoteroLocalApiClient,
} from './zotero-local-api-client';

const LOCAL_USER_LIBRARY: ZoteroLibraryRef = Object.freeze({ type: 'user', id: '0' });
const PDF_ENRICHMENT_CONCURRENCY = 4;

export class ZoteroBridgeService {
  public constructor(private readonly client: ZoteroLocalApiClient) {}

  public detectZotero(): Promise<ZoteroConnectionStatus> {
    return this.client.detectZotero();
  }

  public async listItems(input: ZoteroPageRequest, signal?: AbortSignal): Promise<ZoteroItemPage> {
    return this.loadItemsPage(input, null, signal);
  }

  public async searchItems(
    input: ZoteroPageRequest & { readonly query: string },
    signal?: AbortSignal,
  ): Promise<ZoteroItemPage> {
    return this.loadItemsPage(input, input.query, signal);
  }

  public async getItem(ref: ZoteroItemRef): Promise<ZoteroItemDetails> {
    await this.requireIdentity(ref.serverId);
    const item = await this.client.getItem(ref.library, ref.itemKey, ref.serverId);
    const primaryPdf = await this.findPrimaryPdfInternal(ref);
    return this.mapItemDetails(item, ref.serverId, ref.library, primaryPdf?.pdf ?? noPdf());
  }

  public async listCollections(): Promise<readonly ZoteroCollection[]> {
    const identity = await this.requireIdentity();
    const collections = await this.client.listCollections(LOCAL_USER_LIBRARY, identity.serverId);
    return collections.map((collection) =>
      this.mapCollection(collection, identity.serverId, LOCAL_USER_LIBRARY),
    );
  }

  public async listCollectionItems(
    ref: ZoteroCollectionRef,
  ): Promise<readonly ZoteroItemSummary[]> {
    await this.requireIdentity(ref.serverId);
    const items = await this.client.listCollectionTopItems(
      ref.library,
      ref.collectionKey,
      ref.serverId,
    );
    return this.mapSummaries(items, ref.serverId, ref.library);
  }

  public async listAttachments(ref: ZoteroItemRef): Promise<readonly ZoteroAttachment[]> {
    await this.requireIdentity(ref.serverId);
    return this.listAttachmentsInternal(ref);
  }

  public async findPrimaryPdf(ref: ZoteroItemRef): Promise<ZoteroAttachment | null> {
    await this.requireIdentity(ref.serverId);
    return this.findPrimaryPdfInternal(ref);
  }

  public async resolvePdfAvailability(ref: ZoteroItemRef): Promise<ZoteroPdfAvailability> {
    await this.requireIdentity(ref.serverId);
    const rawAttachment = await this.client.getItem(ref.library, ref.itemKey, ref.serverId);
    if (rawAttachment.data.itemType !== 'attachment') {
      throw new ZoteroBridgeError('NOT_FOUND', 'The Zotero attachment was not found.');
    }
    return this.resolveRawAttachmentPdf(rawAttachment, ref.serverId, ref.library);
  }

  /** Resolves a primary PDF for bounded Main-process extraction; never exposed through IPC. */
  public async resolvePrimaryPdfFile(
    ref: ZoteroItemRef,
    signal?: AbortSignal,
  ): Promise<{ readonly attachment: ZoteroAttachment; readonly filePath: string } | null> {
    await this.requireIdentity(ref.serverId, signal);
    const attachment = await this.findPrimaryPdfInternal(ref, signal);
    if (attachment?.pdf.state !== 'available') return null;
    const filePath = await this.client.resolveAttachmentFilePath(
      attachment.ref.library,
      attachment.ref.itemKey,
      attachment.ref.serverId,
      signal,
    );
    return { attachment, filePath };
  }

  private async loadItemsPage(
    input: ZoteroPageRequest,
    query: string | null,
    signal?: AbortSignal,
  ): Promise<ZoteroItemPage> {
    const identity = await this.requireIdentity(undefined, signal);
    const page = await this.client.requestTopItemsPage(
      LOCAL_USER_LIBRARY,
      identity.serverId,
      input.start,
      input.limit,
      query,
      signal,
    );
    return {
      ...page,
      items: await this.mapSummaries(page.items, identity.serverId, LOCAL_USER_LIBRARY, signal),
    };
  }

  private async requireIdentity(
    expectedServerId?: string,
    signal?: AbortSignal,
  ): Promise<ZoteroServerIdentity> {
    const status = await this.client.detectZotero(signal);
    if (!status.available || !status.serverIdentity) {
      throw connectionErrorToBridgeError(
        status.error ?? {
          code: 'invalid_response',
          message: 'Zotero did not provide a server identity.',
        },
      );
    }
    if (expectedServerId && status.serverIdentity.serverId !== expectedServerId) {
      throw new ZoteroBridgeError(
        'ZOTERO_IDENTITY_CHANGED',
        'The Zotero database identity changed. Refresh the integration before continuing.',
      );
    }
    return status.serverIdentity;
  }

  private async mapSummaries(
    items: readonly RawZoteroItem[],
    serverId: string,
    fallbackLibrary: ZoteroLibraryRef,
    signal?: AbortSignal,
  ): Promise<readonly ZoteroItemSummary[]> {
    const bibliographyItems = items.filter(isBibliographyItem);
    return mapConcurrent(bibliographyItems, PDF_ENRICHMENT_CONCURRENCY, async (item) => {
      const library = this.readLibrary(item, fallbackLibrary);
      const ref = this.itemRef(serverId, library, item.key);
      const primaryPdf = await this.findPrimaryPdfInternal(ref, signal);
      return this.mapItemSummary(item, serverId, library, primaryPdf?.pdf ?? noPdf());
    });
  }

  private async listAttachmentsInternal(
    ref: ZoteroItemRef,
    signal?: AbortSignal,
    concurrency = PDF_ENRICHMENT_CONCURRENCY,
  ): Promise<readonly ZoteroAttachment[]> {
    const children = await this.client.listChildren(ref.library, ref.itemKey, ref.serverId, signal);
    const attachmentItems = children.filter((item) => item.data.itemType === 'attachment');
    return mapConcurrent(attachmentItems, concurrency, async (item) => {
      if (item.data.parentItem && item.data.parentItem !== ref.itemKey) {
        throw new ZoteroBridgeError(
          'ZOTERO_INVALID_RESPONSE',
          'Zotero returned an attachment for a different parent item.',
        );
      }
      const itemLibrary = this.readLibrary(item, ref.library);
      this.assertLibraryIdentity(ref.serverId, itemLibrary);
      const attachmentRef = this.itemRef(ref.serverId, itemLibrary, item.key);
      const pdf = await this.resolveRawAttachmentPdf(item, ref.serverId, itemLibrary, signal);
      return {
        ref: attachmentRef,
        parentItemRef: ref,
        title: clean(item.data.title),
        filename: nullable(item.data.filename),
        contentType: nullable(item.data.contentType),
        linkMode: mapLinkMode(item.data.linkMode),
        isPdf: isPdfAttachment(item),
        pdf,
        version: item.version,
      };
    });
  }

  private async findPrimaryPdfInternal(
    ref: ZoteroItemRef,
    signal?: AbortSignal,
  ): Promise<ZoteroAttachment | null> {
    const attachments = (await this.listAttachmentsInternal(ref, signal, 1)).filter(
      (attachment) => attachment.isPdf,
    );
    attachments.sort((left, right) => pdfRank(left.pdf) - pdfRank(right.pdf));
    return attachments[0] ?? null;
  }

  private async resolveRawAttachmentPdf(
    item: RawZoteroItem,
    serverId: string,
    library: ZoteroLibraryRef,
    signal?: AbortSignal,
  ): Promise<ZoteroPdfAvailability> {
    if (!isPdfAttachment(item)) {
      return noPdf();
    }
    const storageMode = mapStorageMode(item.data.linkMode);
    const available = await this.client.isAttachmentFileAvailable(
      library,
      item.key,
      serverId,
      signal,
    );
    return {
      hasPdf: true,
      storageMode,
      state: available ? 'available' : storageMode === 'stored' ? 'not_local' : 'missing',
    };
  }

  private mapItemSummary(
    item: RawZoteroItem,
    serverId: string,
    fallbackLibrary: ZoteroLibraryRef,
    pdf: ZoteroPdfAvailability,
  ): ZoteroItemSummary {
    const library = this.readLibrary(item, fallbackLibrary);
    this.assertLibraryIdentity(serverId, library);
    return {
      ref: this.itemRef(serverId, library, item.key),
      itemType: clean(item.data.itemType) || 'unknown',
      title: clean(item.data.title),
      creators: mapCreators(item.data.creators),
      date: nullable(item.data.date),
      year: parseYear(item.data.date),
      publication: firstValue(
        item.data.publicationTitle,
        item.data.proceedingsTitle,
        item.data.bookTitle,
        item.data.publisher,
        item.data.university,
        item.data.institution,
        item.data.websiteTitle,
        item.data.seriesTitle,
      ),
      pdf,
      version: item.version,
    };
  }

  private mapItemDetails(
    item: RawZoteroItem,
    serverId: string,
    fallbackLibrary: ZoteroLibraryRef,
    pdf: ZoteroPdfAvailability,
  ): ZoteroItemDetails {
    const summary = this.mapItemSummary(item, serverId, fallbackLibrary, pdf);
    return {
      ...summary,
      doi: nullable(item.data.DOI),
      abstract: nullable(item.data.abstractNote),
      url: nullable(item.data.url),
      tags: (item.data.tags ?? []).map(({ tag }) => clean(tag)).filter(Boolean),
      collections: (item.data.collections ?? []).map((collectionKey) => ({
        serverId,
        library: summary.ref.library,
        collectionKey: this.objectKey(collectionKey),
      })),
    };
  }

  private mapCollection(
    collection: RawZoteroCollection,
    serverId: string,
    fallbackLibrary: ZoteroLibraryRef,
  ): ZoteroCollection {
    const library = collection.library
      ? { type: collection.library.type, id: String(collection.library.id) }
      : fallbackLibrary;
    this.assertLibraryIdentity(serverId, library);
    const ref = this.collectionRef(serverId, library, collection.key);
    const parentKey = collection.data.parentCollection;
    return {
      ref,
      name: clean(collection.data.name),
      parent:
        typeof parentKey === 'string' ? this.collectionRef(serverId, library, parentKey) : null,
      version: collection.version,
    };
  }

  private readLibrary(item: RawZoteroItem, fallback: ZoteroLibraryRef): ZoteroLibraryRef {
    return item.library ? { type: item.library.type, id: String(item.library.id) } : fallback;
  }

  private itemRef(serverId: string, library: ZoteroLibraryRef, itemKey: string): ZoteroItemRef {
    return { serverId, library, itemKey: this.objectKey(itemKey) };
  }

  private collectionRef(
    serverId: string,
    library: ZoteroLibraryRef,
    collectionKey: string,
  ): ZoteroCollectionRef {
    return { serverId, library, collectionKey: this.objectKey(collectionKey) };
  }

  private objectKey(value: string): string {
    if (!/^[23456789ABCDEFGHIJKLMNPQRSTUVWXYZ]{8}$/u.test(value)) {
      throw new ZoteroBridgeError(
        'ZOTERO_INVALID_RESPONSE',
        'Zotero returned an invalid object key.',
      );
    }
    return value;
  }

  private assertLibraryIdentity(serverId: string, library: ZoteroLibraryRef): void {
    if (serverId.startsWith('legacy-user-') && serverId !== `legacy-user-${library.id}`) {
      throw new ZoteroBridgeError(
        'ZOTERO_IDENTITY_CHANGED',
        'The Zotero library identity changed. Refresh the integration before continuing.',
      );
    }
  }
}

function clean(value: string | undefined): string {
  return value?.trim() ?? '';
}

function nullable(value: string | undefined): string | null {
  const normalized = clean(value);
  return normalized || null;
}

function firstValue(...values: readonly (string | undefined)[]): string | null {
  return values.map(clean).find(Boolean) ?? null;
}

function mapCreators(creators: RawZoteroItem['data']['creators']): readonly ZoteroCreator[] {
  return (creators ?? [])
    .map((creator) => ({
      creatorType: clean(creator.creatorType) || 'creator',
      name:
        clean(creator.name) ||
        [clean(creator.firstName), clean(creator.lastName)].filter(Boolean).join(' '),
    }))
    .filter(({ name }) => Boolean(name));
}

function parseYear(date: string | undefined): number | null {
  const match = date?.match(/(?:^|\D)((?:1[0-9]{3}|2[0-9]{3}))(?:\D|$)/u);
  return match?.[1] ? Number(match[1]) : null;
}

function isPdfAttachment(item: RawZoteroItem): boolean {
  return (
    item.data.itemType === 'attachment' &&
    (item.data.contentType?.toLowerCase() === 'application/pdf' ||
      item.data.filename?.toLowerCase().endsWith('.pdf') === true)
  );
}

function isBibliographyItem(item: RawZoteroItem): boolean {
  return (
    !item.data.parentItem &&
    item.data.itemType !== 'attachment' &&
    item.data.itemType !== 'annotation' &&
    item.data.itemType !== 'note'
  );
}

function mapLinkMode(value: string | undefined): ZoteroAttachmentLinkMode {
  if (
    value === 'imported_file' ||
    value === 'imported_url' ||
    value === 'linked_file' ||
    value === 'linked_url'
  ) {
    return value;
  }
  return 'unknown';
}

function mapStorageMode(value: string | undefined): ZoteroPdfStorageMode {
  return value === 'linked_file' || value === 'linked_url' ? 'linked' : 'stored';
}

function noPdf(): ZoteroPdfAvailability {
  return { hasPdf: false, state: 'none', storageMode: null };
}

function pdfRank(pdf: ZoteroPdfAvailability): number {
  const stateRank = { available: 0, not_local: 2, missing: 3, none: 4 }[pdf.state];
  const storageRank = pdf.storageMode === 'stored' ? 0 : 1;
  return stateRank * 2 + storageRank;
}

async function mapConcurrent<T, U>(
  values: readonly T[],
  concurrency: number,
  map: (value: T) => Promise<U>,
): Promise<readonly U[]> {
  const output = new Array<U>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) {
        output[index] = await map(value);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}
