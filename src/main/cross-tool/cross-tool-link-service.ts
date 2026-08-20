import type { CrossToolOpenInput, CrossToolOpenResult } from '../../shared/contracts/cross-tool';
import type { WorkspaceDataGateway } from '../workspace/workspace-data-gateway';
import type { RepositoryDataGateway } from '../repository/repository-data-gateway';
import type { RepositoryService } from '../repository/repository-service';
import type { ResearchMemoryDataGateway } from '../research-memory/research-memory-data-gateway';
import type { ResearchGraphService } from '../research-graph/research-graph-service';
import type { ZoteroEvidenceLauncher } from '../question/zotero-evidence-launcher';
import { LibraryError } from '../library/errors';
interface Opener {
  openExternal(url: string): Promise<void>;
}
export class CrossToolLinkService {
  constructor(
    private readonly graph: ResearchGraphService,
    private readonly workspace: WorkspaceDataGateway,
    private readonly repositories: RepositoryDataGateway,
    private readonly repositoryNavigation: Pick<RepositoryService, 'openInVscode'>,
    private readonly memory: ResearchMemoryDataGateway,
    private readonly zotero: Pick<ZoteroEvidenceLauncher, 'openItem'>,
    private readonly opener: Opener,
  ) {}
  async open(input: CrossToolOpenInput): Promise<CrossToolOpenResult> {
    const projection = await this.graph.getProjection(input.workspaceId),
      node = projection.nodes.find((n) => n.id === input.nodeId);
    if (!node) throw new LibraryError('NOT_FOUND', 'The Graph node is not in this Workspace.');
    if (node.kind === 'repository' && node.relatedId) {
      const repo = (await this.repositories.listWorkspaceRepositories(input.workspaceId)).find(
        (r) => r.id === node.relatedId,
      );
      if (!repo)
        throw new LibraryError('INVALID_INPUT', 'The Repository is not in this Workspace.');
      if (input.action === 'github') {
        const url = githubUrl(repo.remotes.map((r) => r.url));
        if (!url)
          return fallback(
            'github',
            'No validated github.com remote is available.',
            'Copy the repository remote from the Code view.',
          );
        return this.external('github', url, 'Open the repository manually in GitHub.');
      }
      await this.repositoryNavigation.openInVscode({ repositoryId: repo.id });
      return { opened: true, target: 'vscode', reason: null, fallback: null };
    }
    if (node.kind === 'paper' && input.action === 'primary') {
      const papers = await this.workspace.listWorkspaceZoteroPapers(input.workspaceId),
        paper = papers.find(
          (p) =>
            paperNodeId(
              p.itemRef.serverId,
              p.itemRef.library.type,
              p.itemRef.library.id,
              p.itemRef.itemKey,
            ) === node.id,
        );
      if (!paper)
        throw new LibraryError('INVALID_INPUT', 'The Zotero reference is not in this Workspace.');
      try {
        await this.zotero.openItem(paper.itemRef);
        return { opened: true, target: 'zotero', reason: null, fallback: null };
      } catch {
        return fallback(
          'zotero',
          'Zotero could not be opened.',
          'Start Zotero and retry from the Graph.',
        );
      }
    }
    if (node.kind === 'memory' && node.relatedId && input.action === 'primary') {
      const record = await this.memory.getLatestResearchExport(
        input.workspaceId,
        'memory',
        node.relatedId,
      );
      if (!record)
        return fallback(
          'obsidian',
          'This Memory has no recorded Obsidian export.',
          'Export it from Notes before opening Obsidian.',
        );
      const uri = new URL('obsidian://open');
      uri.searchParams.set('vault', record.vaultName);
      uri.searchParams.set('file', record.relativePath.replace(/\.md$/iu, ''));
      return this.external(
        'obsidian',
        uri.toString(),
        'Open the exported note manually in Obsidian.',
      );
    }
    throw new LibraryError(
      'INVALID_INPUT',
      'That outbound action is not available for this Graph node.',
    );
  }
  private async external(target: 'github' | 'obsidian', url: string, fallbackText: string) {
    try {
      await this.opener.openExternal(url);
      return { opened: true, target, reason: null, fallback: null } as const;
    } catch {
      return fallback(
        target,
        `${target === 'github' ? 'GitHub' : 'Obsidian'} could not be opened.`,
        fallbackText,
      );
    }
  }
}
function fallback(
  target: CrossToolOpenResult['target'],
  reason: string,
  text: string,
): CrossToolOpenResult {
  return { opened: false, target, reason, fallback: text };
}
function paperNodeId(s: string, t: string, l: string, k: string) {
  return `paper:${s}:${t}:${l}:${k}`;
}
export function githubUrl(remotes: readonly string[]): string | null {
  for (const raw of remotes) {
    const ssh = /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/u.exec(raw);
    if (ssh?.[1] && ssh[2]) return `https://github.com/${ssh[1]}/${ssh[2]}`;
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:' && u.hostname === 'github.com' && !u.username && !u.password) {
        const m = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/u.exec(u.pathname);
        if (m?.[1] && m[2]) return `https://github.com/${m[1]}/${m[2]}`;
      }
    } catch {
      continue;
    }
  }
  return null;
}
