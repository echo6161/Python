import { randomUUID } from 'node:crypto';

import type {
  AddResearchReferenceInput,
  CreateResearchContentInput,
  CreateResearchMemoryProposalInput,
  ListResearchContentInput,
  RejectResearchMemoryProposalInput,
  ResearchContentIdentityInput,
  ResearchMemoryProposal,
  ResearchReferenceIdentityInput,
  ReviewResearchMemoryProposalInput,
  UpdateResearchContentInput,
} from '../../shared/contracts/research-memory';
import type { KnowledgeEngineService } from '../knowledge/knowledge-engine-service';
import { LibraryError } from '../library/errors';
import type { MemoryExportService } from './memory-export-service';
import type { MemoryProposalGenerator } from './memory-proposal-generator';
import type { ResearchMemoryDataGateway } from './research-memory-data-gateway';

export class ResearchMemoryService {
  public constructor(
    private readonly data: ResearchMemoryDataGateway,
    private readonly knowledge: KnowledgeEngineService,
    private readonly generator: MemoryProposalGenerator,
    private readonly exports: MemoryExportService,
  ) {}

  public list(input: ListResearchContentInput) {
    return this.data.listResearchContent(input);
  }

  public async get(input: ResearchContentIdentityInput) {
    const item = await this.data.getResearchContent(input);
    if (!item) throw new LibraryError('NOT_FOUND', 'The research item was not found.');
    return item;
  }

  public create(input: CreateResearchContentInput) {
    return this.data.createResearchContent(input);
  }
  public update(input: UpdateResearchContentInput) {
    return this.data.updateResearchContent(input);
  }

  public async delete(input: ResearchContentIdentityInput) {
    if (!(await this.data.deleteResearchContent(input)))
      throw new LibraryError('NOT_FOUND', 'The research item was not found.');
    return { id: input.id };
  }

  public async searchSources(workspaceId: string, query: string) {
    const page = await this.knowledge.search({ workspaceId, query, limit: 20 });
    return page.results.map(({ chunkId, sourceType, title, citation, snippet }) => ({
      chunkId,
      sourceType,
      title,
      citation,
      snippet,
    }));
  }

  public async addReference(input: AddResearchReferenceInput) {
    await this.get(input);
    const chunk = await this.knowledge.getChunk(input.workspaceId, input.chunkId);
    if (!chunk)
      throw new LibraryError('NOT_FOUND', 'The selected source is unavailable in this Workspace.');
    await this.data.addResearchReference({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      ownerType: input.type,
      ownerId: input.id,
      chunkId: chunk.id,
      sourceType: chunk.sourceType,
      title: chunk.title,
      citation: chunk.citation,
      snippet: chunk.content.slice(0, 1_200),
      provenanceJson: chunk.provenanceJson,
      createdAt: new Date().toISOString(),
    });
    return this.get(input);
  }

  public async removeReference(input: ResearchReferenceIdentityInput) {
    if (
      !(await this.data.removeResearchReference({
        workspaceId: input.workspaceId,
        ownerType: input.type,
        ownerId: input.id,
        referenceId: input.referenceId,
      }))
    ) {
      throw new LibraryError('NOT_FOUND', 'The source reference was not found.');
    }
    return this.get(input);
  }

  public async openReference(input: ResearchReferenceIdentityInput) {
    const reference = await this.data.getResearchReference({
      workspaceId: input.workspaceId,
      ownerType: input.type,
      ownerId: input.id,
      referenceId: input.referenceId,
    });
    if (!reference) throw new LibraryError('NOT_FOUND', 'The source reference was not found.');
    if (!reference.chunkId)
      return {
        opened: false,
        target: reference.sourceType,
        relatedId: null,
        reason: 'The indexed source is no longer available. The saved citation remains unchanged.',
      } as const;
    try {
      return await this.knowledge.openResult(input.workspaceId, reference.chunkId);
    } catch {
      return {
        opened: false,
        target: reference.sourceType,
        relatedId: null,
        reason:
          'The indexed source is no longer available. Rebuild the Knowledge index to navigate.',
      } as const;
    }
  }

  public async createProposal(
    input: CreateResearchMemoryProposalInput,
  ): Promise<ResearchMemoryProposal> {
    const source = await this.get({
      workspaceId: input.workspaceId,
      type: 'note',
      id: input.sourceNoteId,
    });
    if (source.type !== 'note')
      throw new LibraryError('INVALID_INPUT', 'A Memory proposal must start from a Note.');
    const generated = await this.generator.generate(source, input.reason);
    return this.data.createResearchMemoryProposal({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      sourceNoteId: source.id,
      title: generated.title,
      bodyMarkdown: generated.bodyMarkdown,
      reason: input.reason,
      providerId: generated.providerId,
      model: generated.model,
      createdAt: new Date().toISOString(),
    });
  }

  public listProposals(workspaceId: string) {
    return this.data.listResearchMemoryProposals(workspaceId);
  }
  public confirmProposal(input: ReviewResearchMemoryProposalInput) {
    return this.data.confirmResearchMemoryProposal(input);
  }
  public rejectProposal(input: RejectResearchMemoryProposalInput) {
    return this.data.rejectResearchMemoryProposal(input);
  }
  public prepareExport(input: ResearchContentIdentityInput, ownerId: number) {
    return this.exports.prepare(input, ownerId);
  }
  public confirmExport(previewId: string, ownerId: number) {
    return this.exports.confirm(previewId, ownerId);
  }
}
