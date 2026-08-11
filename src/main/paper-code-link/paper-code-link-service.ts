import type {
  CreatePaperCodeLinkInput,
  PaperCodeLink,
  PaperCodeLinkCodeQuery,
  PaperCodeLinkNavigationResult,
  PaperCodeLinkPaperQuery,
  UpdatePaperCodeLinkInput,
} from '../../shared/contracts/paper-code-link';
import type { CodeIntelligenceService } from '../code-intelligence/code-intelligence-service';
import { LibraryError } from '../library/errors';
import type { ZoteroEvidenceLauncher } from '../question/zotero-evidence-launcher';
import type { RepositoryDataGateway } from '../repository/repository-data-gateway';
import type { RepositoryService } from '../repository/repository-service';
import type { ZoteroBridgeService } from '../zotero/zotero-bridge-service';
import type { PaperCodeLinkDataGateway, StoredPaperCodeLink } from './paper-code-link-data-gateway';

export class PaperCodeLinkService {
  public constructor(
    private readonly data: PaperCodeLinkDataGateway,
    private readonly zotero: Pick<ZoteroBridgeService, 'findPrimaryPdf' | 'getItem'>,
    private readonly repositories: Pick<
      RepositoryDataGateway,
      'getRepository' | 'listWorkspaceRepositories'
    >,
    private readonly code: Pick<CodeIntelligenceService, 'getStatus'>,
    private readonly repositoryNavigation: Pick<RepositoryService, 'openInVscode'>,
    private readonly zoteroNavigation: Pick<ZoteroEvidenceLauncher, 'openItem' | 'openPdf'>,
  ) {}

  public async create(input: CreatePaperCodeLinkInput): Promise<PaperCodeLink> {
    const [item, status] = await Promise.all([
      this.zotero.getItem(input.itemRef),
      this.code.getStatus(input.repositoryId),
    ]);
    if (
      status.status !== 'ready' ||
      status.snapshotIdentity !== input.codeSnapshotIdentity ||
      status.currentSnapshotIdentity !== input.codeSnapshotIdentity
    ) {
      throw new LibraryError(
        'CONFLICT',
        'The code index changed. Refresh the search and preview before saving the link.',
      );
    }
    const stored = await this.data.createPaperCodeLink({
      ...input,
      itemVersion: item.version,
      paperSnapshotIdentity: zoteroSnapshotIdentity(item.ref, item.version),
      pageNumber: input.pageNumber ?? null,
      textAnchor: input.textAnchor ?? null,
      provenance: 'manual',
    });
    return this.resolve(stored);
  }

  public async get(workspaceId: string, id: string): Promise<PaperCodeLink> {
    const stored = await this.data.getPaperCodeLink(workspaceId, id);
    if (!stored) throw new LibraryError('NOT_FOUND', 'The Paper-Code Link no longer exists.');
    return this.resolve(stored);
  }

  public async listForWorkspace(workspaceId: string): Promise<readonly PaperCodeLink[]> {
    return resolveWithConcurrency(await this.data.listPaperCodeLinks(workspaceId), (link) =>
      this.resolve(link),
    );
  }

  public async listForPaper(input: PaperCodeLinkPaperQuery): Promise<readonly PaperCodeLink[]> {
    const links = await this.data.listPaperCodeLinks(input.workspaceId);
    return resolveWithConcurrency(
      links.filter((link) => sameItem(link, input)),
      (link) => this.resolve(link),
    );
  }

  public async listForCode(input: PaperCodeLinkCodeQuery): Promise<readonly PaperCodeLink[]> {
    const links = await this.data.listPaperCodeLinks(input.workspaceId);
    return resolveWithConcurrency(
      links.filter(
        (link) =>
          link.repositoryId === input.repositoryId &&
          (input.relativePath === undefined || link.relativePath === input.relativePath),
      ),
      (link) => this.resolve(link),
    );
  }

  public async update(input: UpdatePaperCodeLinkInput): Promise<PaperCodeLink> {
    return this.resolve(await this.data.updatePaperCodeLink(input));
  }

  public async delete(workspaceId: string, id: string): Promise<{ readonly id: string }> {
    if (!(await this.data.deletePaperCodeLink(workspaceId, id))) {
      throw new LibraryError('NOT_FOUND', 'The Paper-Code Link no longer exists.');
    }
    return { id };
  }

  public async openPaper(workspaceId: string, id: string): Promise<PaperCodeLinkNavigationResult> {
    const link = await this.get(workspaceId, id);
    if (link.paperAvailability === 'unavailable') {
      return { id, opened: false, target: 'zotero_item', reason: link.paperAvailabilityReason };
    }
    if (link.pageNumber !== null) {
      const attachment = await this.zotero.findPrimaryPdf(link.itemRef);
      if (attachment?.pdf.state === 'available') {
        await this.zoteroNavigation.openPdf(attachment.ref, link.pageNumber);
        return { id, opened: true, target: 'zotero_pdf', reason: link.paperAvailabilityReason };
      }
    }
    await this.zoteroNavigation.openItem(link.itemRef);
    return {
      id,
      opened: true,
      target: 'zotero_item',
      reason:
        link.pageNumber === null
          ? link.paperAvailabilityReason
          : 'The referenced PDF page is not locally available; the Zotero item was opened instead.',
    };
  }

  public async openCode(workspaceId: string, id: string): Promise<PaperCodeLinkNavigationResult> {
    const link = await this.get(workspaceId, id);
    if (link.codeAvailability !== 'available') {
      return { id, opened: false, target: 'code', reason: link.codeAvailabilityReason };
    }
    await this.repositoryNavigation.openInVscode({
      repositoryId: link.repositoryId,
      relativePath: link.relativePath,
      line: link.startLine,
    });
    return { id, opened: true, target: 'code', reason: null };
  }

  private async resolve(stored: StoredPaperCodeLink): Promise<PaperCodeLink> {
    const [paper, code] = await Promise.all([this.resolvePaper(stored), this.resolveCode(stored)]);
    return { ...stored, ...paper, ...code };
  }

  private async resolvePaper(stored: StoredPaperCodeLink) {
    try {
      const item = await this.zotero.getItem(stored.itemRef);
      const stale = item.version !== stored.itemVersion;
      return {
        item,
        pdf: item.pdf,
        paperAvailability: stale ? ('stale' as const) : ('available' as const),
        paperAvailabilityReason: stale
          ? 'The Zotero item changed after this link was recorded.'
          : null,
      };
    } catch {
      return {
        item: null,
        pdf: null,
        paperAvailability: 'unavailable' as const,
        paperAvailabilityReason: 'The Zotero item or its original Zotero profile is unavailable.',
      };
    }
  }

  private async resolveCode(stored: StoredPaperCodeLink) {
    const repository = await this.repositories.getRepository(stored.repositoryId);
    const memberships = await this.repositories.listWorkspaceRepositories(stored.workspaceId);
    if (!repository || !memberships.some(({ id }) => id === stored.repositoryId)) {
      return unavailableCode(null, 'The repository is no longer linked to this Workspace.');
    }
    if (repository.availability !== 'available') {
      return unavailableCode(repository.displayName, 'The repository is unavailable.');
    }
    const status = await this.code.getStatus(stored.repositoryId);
    const current = status.currentSnapshotIdentity;
    if (!current) {
      return unavailableCode(repository.displayName, 'The current source snapshot cannot be read.');
    }
    if (current !== stored.codeSnapshotIdentity) {
      return {
        repositoryName: repository.displayName,
        currentCodeSnapshotIdentity: current,
        codeAvailability: 'stale' as const,
        codeAvailabilityReason: 'The repository content changed after this link was recorded.',
      };
    }
    const exists = await this.data.paperCodeLocationExists(stored);
    return {
      repositoryName: repository.displayName,
      currentCodeSnapshotIdentity: current,
      codeAvailability: exists ? ('available' as const) : ('unavailable' as const),
      codeAvailabilityReason: exists ? null : 'The indexed code location is no longer available.',
    };
  }
}

function zoteroSnapshotIdentity(ref: StoredPaperCodeLink['itemRef'], version: number): string {
  return `zotero:${ref.serverId}:${ref.library.type}:${ref.library.id}:${ref.itemKey}:v${String(version)}`;
}

function sameItem(link: StoredPaperCodeLink, query: PaperCodeLinkPaperQuery): boolean {
  return (
    link.itemRef.serverId === query.itemRef.serverId &&
    link.itemRef.library.type === query.itemRef.library.type &&
    link.itemRef.library.id === query.itemRef.library.id &&
    link.itemRef.itemKey === query.itemRef.itemKey
  );
}

function unavailableCode(repositoryName: string | null, reason: string) {
  return {
    repositoryName,
    currentCodeSnapshotIdentity: null,
    codeAvailability: 'unavailable' as const,
    codeAvailabilityReason: reason,
  };
}

async function resolveWithConcurrency<T, R>(
  values: readonly T[],
  resolve: (value: T) => Promise<R>,
): Promise<readonly R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      const value = values[index];
      if (value !== undefined) results[index] = await resolve(value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, values.length) }, worker));
  return results;
}
