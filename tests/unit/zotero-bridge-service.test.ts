import { describe, expect, it } from 'vitest';

import { ZoteroBridgeService } from '../../src/main/zotero/zotero-bridge-service';
import {
  type ZoteroFetch,
  ZoteroLocalApiClient,
} from '../../src/main/zotero/zotero-local-api-client';
import type { ZoteroCollectionRef, ZoteroItemRef } from '../../src/shared/contracts/zotero';

const SERVER_ID = 'ServerIdentity01';
const USER_LIBRARY = { type: 'user', id: '0' } as const;
const PARENT_KEY = 'PARENTA2';
const STORED_KEY = 'STREDAA2';
const LINKED_KEY = 'NKEDAAA2';
const CLOUD_KEY = 'CUDDAAA2';
const COLLECTION_KEY = 'CECTAAA2';
const CHILD_COLLECTION_KEY = 'CECTAAB2';

describe('ZoteroBridgeService', () => {
  it('searches top-level bibliography items and maps common metadata with missing fields', async () => {
    const itemTypes = [
      'journalArticle',
      'conferencePaper',
      'preprint',
      'thesis',
      'bookSection',
      'report',
      'webpage',
    ];
    const items = itemTypes.map((itemType, index) =>
      rawItem(`TYPEAAA${String(index + 2)}`, itemType, {
        title: index === 0 ? 'Mapped research paper' : '',
        creators:
          index === 0
            ? [
                { creatorType: 'author', firstName: 'Ada', lastName: 'Lovelace' },
                { creatorType: 'author', name: 'Research Consortium' },
              ]
            : [],
        date: index === 0 ? '2025-04-12' : '',
        DOI: index === 0 ? '10.1000/example' : '',
        abstractNote: index === 0 ? 'Evidence summary.' : '',
        publicationTitle: index === 0 ? 'Journal of Tests' : '',
        url: index === 0 ? 'https://example.test/paper' : '',
        tags: index === 0 ? [{ tag: 'methods' }] : [],
        collections: index === 0 ? [COLLECTION_KEY] : [],
      }),
    );
    const fetch = router((url) => {
      if (url.pathname.endsWith('/items/top')) {
        expect(url.searchParams.get('q')).toBe('methods');
        return response(items);
      }
      if (url.pathname.endsWith('/items/TYPEAAA2')) return response(items[0]);
      if (url.pathname.endsWith('/children')) return response([]);
      throw new Error(`Unexpected path: ${url.pathname}`);
    });
    const service = new ZoteroBridgeService(new ZoteroLocalApiClient({ fetch }));

    const page = await service.searchItems({
      requestId: '00000000-0000-4000-8000-000000000001',
      start: 0,
      limit: 25,
      query: 'methods',
    });
    const summaries = page.items;
    expect(summaries.map(({ itemType }) => itemType)).toEqual(itemTypes);
    expect(summaries[0]).toMatchObject({
      title: 'Mapped research paper',
      creators: [
        { creatorType: 'author', name: 'Ada Lovelace' },
        { creatorType: 'author', name: 'Research Consortium' },
      ],
      year: 2025,
      publication: 'Journal of Tests',
      pdf: { hasPdf: false, state: 'none', storageMode: null },
    });

    const firstSummary = summaries[0];
    if (!firstSummary) throw new Error('Expected a mapped Zotero item.');
    const details = await service.getItem(firstSummary.ref);
    expect(details).toMatchObject({
      doi: '10.1000/example',
      abstract: 'Evidence summary.',
      tags: ['methods'],
      collections: [{ collectionKey: COLLECTION_KEY }],
    });
    expect(summaries[1]).toMatchObject({ title: '', creators: [], year: null });
  });

  it('maps nested collections and lists only top-level collection items', async () => {
    const fetch = router((url) => {
      if (url.pathname.endsWith('/collections')) {
        return response([
          rawCollection(COLLECTION_KEY, 'Root collection', false),
          rawCollection(CHILD_COLLECTION_KEY, 'Nested collection', COLLECTION_KEY),
        ]);
      }
      if (url.pathname.endsWith(`/collections/${COLLECTION_KEY}/items/top`)) {
        return response([rawItem(PARENT_KEY, 'report', { title: 'Collection paper' })]);
      }
      if (url.pathname.endsWith('/children')) return response([]);
      throw new Error(`Unexpected path: ${url.pathname}`);
    });
    const service = new ZoteroBridgeService(new ZoteroLocalApiClient({ fetch }));

    const collections = await service.listCollections();
    expect(collections).toHaveLength(2);
    expect(collections[1]?.parent).toEqual(collections[0]?.ref);

    const rootCollection = collections[0];
    if (!rootCollection) throw new Error('Expected a root Zotero collection.');
    const items = await service.listCollectionItems(rootCollection.ref);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('Collection paper');
  });

  it('handles empty results and unknown item types without inventing metadata', async () => {
    const unknown = rawItem('UNKNWN22', 'futureResearchObject', {});
    const childAttachment = rawItem('CHLDAAA2', 'attachment', {
      parentItem: 'UNKNWN22',
      contentType: 'application/pdf',
      filename: 'child.pdf',
    });
    const fetch = router((url) => {
      if (url.pathname.endsWith('/items/top')) {
        return response(url.searchParams.get('q') === 'none' ? [] : [unknown, childAttachment]);
      }
      if (url.pathname.endsWith('/children')) return response([]);
      throw new Error(`Unexpected path: ${url.pathname}`);
    });
    const service = new ZoteroBridgeService(new ZoteroLocalApiClient({ fetch }));
    const base = { requestId: '00000000-0000-4000-8000-000000000002', start: 0, limit: 25 };

    await expect(service.searchItems({ ...base, query: 'none' })).resolves.toMatchObject({
      items: [],
      hasNext: false,
    });
    await expect(service.searchItems({ ...base, query: 'future' })).resolves.toMatchObject({
      items: [
        {
          itemType: 'futureResearchObject',
          title: '',
          creators: [],
          date: null,
          year: null,
          publication: null,
        },
      ],
    });
  });

  it('detects stored, linked, missing, and not-local PDFs without exposing a file path', async () => {
    const fetch = router((url) => {
      if (url.pathname.endsWith(`/${PARENT_KEY}/children`)) {
        return response([
          rawAttachment(STORED_KEY, 'imported_file', 'stored.pdf'),
          rawAttachment(LINKED_KEY, 'linked_file', 'linked.pdf'),
          rawAttachment(CLOUD_KEY, 'imported_file', 'cloud.pdf'),
        ]);
      }
      if (url.pathname.endsWith(`/${STORED_KEY}/file/view/url`)) {
        return response('file:///private/zotero/stored.pdf');
      }
      if (
        url.pathname.endsWith(`/${LINKED_KEY}/file/view/url`) ||
        url.pathname.endsWith(`/${CLOUD_KEY}/file/view/url`)
      ) {
        return response('', 404);
      }
      if (url.pathname.endsWith(`/${CLOUD_KEY}`)) {
        return response(rawAttachment(CLOUD_KEY, 'imported_file', 'cloud.pdf'));
      }
      throw new Error(`Unexpected path: ${url.pathname}`);
    });
    const service = new ZoteroBridgeService(new ZoteroLocalApiClient({ fetch }));
    const parentRef = itemRef(PARENT_KEY);

    const attachments = await service.listAttachments(parentRef);
    expect(
      attachments.map(({ ref, linkMode, pdf }) => ({ key: ref.itemKey, linkMode, pdf })),
    ).toEqual([
      {
        key: STORED_KEY,
        linkMode: 'imported_file',
        pdf: { hasPdf: true, state: 'available', storageMode: 'stored' },
      },
      {
        key: LINKED_KEY,
        linkMode: 'linked_file',
        pdf: { hasPdf: true, state: 'missing', storageMode: 'linked' },
      },
      {
        key: CLOUD_KEY,
        linkMode: 'imported_file',
        pdf: { hasPdf: true, state: 'not_local', storageMode: 'stored' },
      },
    ]);
    expect(JSON.stringify(attachments)).not.toContain('file:///');

    await expect(service.findPrimaryPdf(parentRef)).resolves.toMatchObject({
      ref: { itemKey: STORED_KEY },
    });
    await expect(service.resolvePdfAvailability(itemRef(CLOUD_KEY))).resolves.toEqual({
      hasPdf: true,
      state: 'not_local',
      storageMode: 'stored',
    });
  });

  it('rejects stale references after a Zotero server/database identity change', async () => {
    const fetch = router(() => response('', 200, { 'Zotero-Server-ID': 'NewServerIdentity2' }));
    const service = new ZoteroBridgeService(new ZoteroLocalApiClient({ fetch }));

    await expect(service.getItem(itemRef(PARENT_KEY))).rejects.toMatchObject({
      code: 'ZOTERO_IDENTITY_CHANGED',
    });
  });
});

function itemRef(itemKey: string): ZoteroItemRef {
  return { serverId: SERVER_ID, library: USER_LIBRARY, itemKey };
}

function rawItem(key: string, itemType: string, fields: Record<string, unknown>) {
  return {
    key,
    version: 5,
    library: { type: 'user', id: 0 },
    data: { key, version: 5, itemType, ...fields },
  };
}

function rawAttachment(key: string, linkMode: string, filename: string) {
  return rawItem(key, 'attachment', {
    parentItem: PARENT_KEY,
    title: filename,
    filename,
    contentType: 'application/pdf',
    linkMode,
  });
}

function rawCollection(
  key: string,
  name: string,
  parentCollection: ZoteroCollectionRef['collectionKey'] | false,
) {
  return {
    key,
    version: 3,
    library: { type: 'user', id: 0 },
    data: { key, version: 3, name, parentCollection },
  };
}

function router(handler: (url: URL) => Response): ZoteroFetch {
  return (input) => {
    const url = new URL(input);
    if (url.pathname === '/api/') return Promise.resolve(response(''));
    return Promise.resolve(handler(url));
  };
}

function response(
  body: unknown,
  status = 200,
  extraHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Zotero-API-Version': '3',
      'Zotero-Schema-Version': '42',
      'Zotero-Server-ID': SERVER_ID,
      ...extraHeaders,
    },
  });
}
