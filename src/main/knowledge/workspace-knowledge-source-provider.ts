import type {
  CodeIndexDataGateway,
  StoredCodeKnowledgeChunk,
} from '../code-intelligence/code-index-data-gateway';
import type { PdfMetadataExtractionClient } from '../metadata/pdf-metadata-extraction-client';
import type {
  PaperCodeLinkDataGateway,
  StoredPaperCodeLink,
} from '../paper-code-link/paper-code-link-data-gateway';
import type { QuestionDataGateway } from '../question/question-data-gateway';
import type { RepositoryDataGateway } from '../repository/repository-data-gateway';
import type { WorkspaceDataGateway } from '../workspace/workspace-data-gateway';
import type { ZoteroBridgeService } from '../zotero/zotero-bridge-service';
import { chunkText, sha256 } from './deterministic-chunker';
import type {
  ExtractedKnowledgeChunk,
  KnowledgeSourceDescriptor,
  KnowledgeSourceProvider,
} from './knowledge-source';

const MAX_SOURCES = 20_000;
const MAX_CODE_CHUNKS_PER_FILE = 2_000;

type ZoteroSource = Pick<
  ZoteroBridgeService,
  'findPrimaryPdf' | 'getItem' | 'resolvePrimaryPdfFile'
>;
type WorkspaceSources = Pick<WorkspaceDataGateway, 'getWorkspace' | 'listWorkspaceZoteroPapers'>;
type RepositorySources = Pick<RepositoryDataGateway, 'listWorkspaceRepositories'>;
type CodeSources = Pick<CodeIndexDataGateway, 'listCodeChunksForKnowledge'>;
type QuestionSources = Pick<QuestionDataGateway, 'listQuestions'>;
type LinkSources = Pick<PaperCodeLinkDataGateway, 'listPaperCodeLinks'>;
type PdfSource = Pick<PdfMetadataExtractionClient, 'extract'>;

export class WorkspaceKnowledgeSourceProvider implements KnowledgeSourceProvider {
  public constructor(
    private readonly workspaces: WorkspaceSources,
    private readonly repositories: RepositorySources,
    private readonly codeIndex: CodeSources,
    private readonly questions: QuestionSources,
    private readonly links: LinkSources,
    private readonly zotero: ZoteroSource,
    private readonly pdfExtraction: PdfSource,
  ) {}

  public async discover(
    workspaceId: string,
    signal: AbortSignal,
  ): Promise<readonly KnowledgeSourceDescriptor[]> {
    if (!(await this.workspaces.getWorkspace(workspaceId))) {
      throw new Error('Workspace was not found.');
    }
    const [paperSources, codeSources, questionSources, linkSources] = await Promise.all([
      this.discoverPapers(workspaceId, signal),
      this.discoverCode(workspaceId),
      this.discoverQuestions(workspaceId),
      this.discoverLinks(workspaceId),
    ]);
    const sources = [...paperSources, ...codeSources, ...questionSources, ...linkSources];
    if (sources.length > MAX_SOURCES) throw new Error('Workspace Knowledge source limit exceeded.');
    return sources.sort((left, right) =>
      `${left.sourceType}:${left.sourceIdentity}`.localeCompare(
        `${right.sourceType}:${right.sourceIdentity}`,
      ),
    );
  }

  private async discoverPapers(
    workspaceId: string,
    signal: AbortSignal,
  ): Promise<readonly KnowledgeSourceDescriptor[]> {
    if (signal.aborted) throw new Error('Knowledge source discovery was cancelled.');
    const papers = await this.workspaces.listWorkspaceZoteroPapers(workspaceId);
    return Promise.all(
      papers.map(async ({ itemRef }) => {
        const identity = stableItemIdentity(itemRef);
        try {
          const [item, attachment] = await Promise.all([
            this.zotero.getItem(itemRef),
            this.zotero.findPrimaryPdf(itemRef),
          ]);
          const snapshotIdentity = attachment
            ? `${identity}:item:${String(item.version)}:attachment:${attachment.ref.itemKey}:${String(attachment.version)}`
            : `${identity}:item:${String(item.version)}:no-pdf`;
          const fingerprint = sha256(
            JSON.stringify({ snapshotIdentity, pdf: attachment?.pdf ?? item.pdf }),
          );
          return {
            sourceType: 'paper' as const,
            sourceIdentity: identity,
            snapshotIdentity,
            title: item.title || itemRef.itemKey,
            fingerprint,
            sourceProvenance: { itemRef, attachmentKey: attachment?.ref.itemKey ?? null },
            extract: async (extractSignal: AbortSignal) => {
              if (attachment?.pdf.state !== 'available') {
                return {
                  unavailableReason: paperUnavailableReason(attachment?.pdf.state ?? 'none'),
                  chunks: [],
                };
              }
              const resolved = await this.zotero.resolvePrimaryPdfFile(itemRef, extractSignal);
              if (!resolved)
                return { unavailableReason: 'The Zotero PDF is not local.', chunks: [] };
              const extracted = await this.pdfExtraction.extract(resolved.filePath, extractSignal);
              const chunks: ExtractedKnowledgeChunk[] = extracted.pages.flatMap((page) =>
                page.status === 'complete'
                  ? chunkText(page.text).map(({ content }) => ({
                      content,
                      citation: `${item.title || itemRef.itemKey}, p. ${String(page.pageNumber)}`,
                      provenance: {
                        sourceType: 'paper',
                        sourceIdentity: identity,
                        snapshotIdentity,
                        indexedAt: '',
                        itemRef,
                        attachmentKey: resolved.attachment.ref.itemKey,
                        pageNumber: page.pageNumber,
                      },
                    }))
                  : [],
              );
              return {
                unavailableReason:
                  chunks.length === 0
                    ? (extracted.issues[0]?.message ?? 'No PDF text was extracted.')
                    : null,
                chunks,
              };
            },
          } satisfies KnowledgeSourceDescriptor;
        } catch (error) {
          const message = safeErrorMessage(error, 'Zotero paper is currently unavailable.');
          return unavailableDescriptor('paper', identity, itemRef.itemKey, message, { itemRef });
        }
      }),
    );
  }

  private async discoverCode(workspaceId: string): Promise<readonly KnowledgeSourceDescriptor[]> {
    const repositories = await this.repositories.listWorkspaceRepositories(workspaceId);
    const values: KnowledgeSourceDescriptor[] = [];
    for (const repository of repositories) {
      const chunks = await this.codeIndex.listCodeChunksForKnowledge(repository.id);
      const byPath = new Map<string, StoredCodeKnowledgeChunk[]>();
      for (const chunk of chunks) {
        const group = byPath.get(chunk.relativePath) ?? [];
        if (group.length < MAX_CODE_CHUNKS_PER_FILE) group.push(chunk);
        byPath.set(chunk.relativePath, group);
      }
      for (const [relativePath, fileChunks] of byPath) {
        const snapshotIdentity =
          fileChunks[0]?.snapshotIdentity ?? `repository:${repository.id}:empty`;
        const identity = `repository:${repository.id}:file:${relativePath}`;
        values.push({
          sourceType: 'code',
          sourceIdentity: identity,
          snapshotIdentity,
          title: relativePath,
          fingerprint: sha256(
            `${snapshotIdentity}:${fileChunks.map((chunk) => chunk.contentHash).join(':')}`,
          ),
          sourceProvenance: { repositoryId: repository.id, relativePath },
          extract: () =>
            Promise.resolve({
              unavailableReason:
                repository.availability === 'available' ? null : 'Repository unavailable.',
              chunks: fileChunks.flatMap((chunk) =>
                chunkText(chunk.content).map(({ content }) => ({
                  content,
                  citation: `${repository.displayName}/${relativePath}:${String(chunk.startLine)}-${String(chunk.endLine)}`,
                  provenance: {
                    sourceType: 'code',
                    sourceIdentity: identity,
                    snapshotIdentity: chunk.snapshotIdentity,
                    indexedAt: '',
                    repositoryId: repository.id,
                    repositoryName: repository.displayName,
                    language: chunk.language,
                    relativePath,
                    startLine: chunk.startLine,
                    endLine: chunk.endLine,
                  },
                })),
              ),
            }),
        });
      }
    }
    return values;
  }

  private async discoverQuestions(
    workspaceId: string,
  ): Promise<readonly KnowledgeSourceDescriptor[]> {
    const questions = await this.questions.listQuestions(workspaceId);
    return questions.map((question) => {
      const identity = `question:${question.id}`;
      const snapshotIdentity = `${identity}:v${String(question.rowVersion)}:${question.updatedAt}`;
      const content = [question.title, question.description].filter(Boolean).join('\n\n');
      return {
        sourceType: 'question',
        sourceIdentity: identity,
        snapshotIdentity,
        title: question.title,
        fingerprint: sha256(`${snapshotIdentity}:${content}`),
        sourceProvenance: { questionId: question.id },
        extract: () =>
          Promise.resolve({
            unavailableReason: null,
            chunks: chunkText(content).map(({ content: chunk }) => ({
              content: chunk,
              citation: `Research question: ${question.title}`,
              provenance: {
                sourceType: 'question',
                sourceIdentity: identity,
                snapshotIdentity,
                indexedAt: '',
                questionId: question.id,
                status: question.status,
              },
            })),
          }),
      };
    });
  }

  private async discoverLinks(workspaceId: string): Promise<readonly KnowledgeSourceDescriptor[]> {
    const links = await this.links.listPaperCodeLinks(workspaceId);
    return links.map((link) => linkDescriptor(link));
  }
}

function linkDescriptor(link: StoredPaperCodeLink): KnowledgeSourceDescriptor {
  const identity = `paper-code-link:${link.id}`;
  const snapshotIdentity = `${identity}:v${String(link.rowVersion)}:${link.updatedAt}`;
  const content = [link.label, link.description, link.relationType, link.locationLabel]
    .filter(Boolean)
    .join('\n');
  return {
    sourceType: 'link',
    sourceIdentity: identity,
    snapshotIdentity,
    title: link.label || `${link.relativePath} link`,
    fingerprint: sha256(`${snapshotIdentity}:${content}`),
    sourceProvenance: { linkId: link.id },
    extract: () =>
      Promise.resolve({
        unavailableReason: null,
        chunks: chunkText(content).map(({ content: chunk }) => ({
          content: chunk,
          citation: `${link.locationLabel || 'Paper'} <-> ${link.relativePath}:${String(link.startLine)}-${String(link.endLine)}`,
          provenance: {
            sourceType: 'link',
            sourceIdentity: identity,
            snapshotIdentity,
            indexedAt: '',
            linkId: link.id,
            itemRef: link.itemRef,
            repositoryId: link.repositoryId,
            relativePath: link.relativePath,
            startLine: link.startLine,
            endLine: link.endLine,
            pageNumber: link.pageNumber,
          },
        })),
      }),
  };
}

function unavailableDescriptor(
  sourceType: 'paper',
  sourceIdentity: string,
  title: string,
  reason: string,
  sourceProvenance: Readonly<Record<string, unknown>>,
): KnowledgeSourceDescriptor {
  return {
    sourceType,
    sourceIdentity,
    snapshotIdentity: `${sourceIdentity}:unavailable`,
    title,
    fingerprint: sha256(`${sourceIdentity}:${reason}`),
    sourceProvenance,
    transientUnavailable: true,
    extract: () => Promise.resolve({ unavailableReason: reason, chunks: [] }),
  };
}

function stableItemIdentity(itemRef: {
  readonly serverId: string;
  readonly library: { readonly type: string; readonly id: string };
  readonly itemKey: string;
}): string {
  return `zotero:${itemRef.serverId}:${itemRef.library.type}:${itemRef.library.id}:${itemRef.itemKey}`;
}

function paperUnavailableReason(state: string): string {
  if (state === 'not_local') return 'The Zotero PDF is not downloaded locally.';
  if (state === 'missing') return 'The Zotero PDF attachment is missing.';
  return 'The Zotero item has no PDF attachment.';
}

function safeErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : '';
  return (message || fallback).slice(0, 500);
}
