import type {
  AddCodeEvidenceInput,
  AddZoteroEvidenceInput,
  ArchiveResearchQuestionInput,
  CodeEvidenceReference,
  CreateResearchQuestionInput,
  EvidenceIdentityInput,
  EvidenceReference,
  OpenEvidenceResult,
  ReorderEvidenceInput,
  ResearchQuestion,
  ResearchQuestionDetails,
  SetResearchQuestionStatusInput,
  UpdateResearchQuestionInput,
  ZoteroEvidenceReference,
} from '../../shared/contracts/question';
import type { RepositoryDataGateway } from '../repository/repository-data-gateway';
import type { RepositoryService } from '../repository/repository-service';
import type { CodeIntelligenceService } from '../code-intelligence/code-intelligence-service';
import type { ZoteroBridgeService } from '../zotero/zotero-bridge-service';
import { LibraryError } from '../library/errors';
import type {
  QuestionDataGateway,
  StoredCodeEvidence,
  StoredEvidence,
  StoredZoteroEvidence,
} from './question-data-gateway';
import type { ZoteroEvidenceLauncher } from './zotero-evidence-launcher';

export class QuestionService {
  public constructor(
    private readonly data: QuestionDataGateway,
    private readonly zotero: Pick<ZoteroBridgeService, 'findPrimaryPdf' | 'getItem'>,
    private readonly repositories: Pick<
      RepositoryDataGateway,
      'getRepository' | 'listWorkspaceRepositories'
    >,
    private readonly code: Pick<CodeIntelligenceService, 'getStatus'>,
    private readonly repositoryNavigation: Pick<RepositoryService, 'openInVscode'>,
    private readonly zoteroNavigation: Pick<ZoteroEvidenceLauncher, 'openItem' | 'openPdf'>,
  ) {}

  public create(input: CreateResearchQuestionInput): Promise<ResearchQuestion> {
    return this.data.createQuestion(input);
  }

  public async get(workspaceId: string, questionId: string): Promise<ResearchQuestionDetails> {
    const question = await this.data.getQuestion(workspaceId, questionId);
    if (!question) throw new LibraryError('NOT_FOUND', 'The Research Question no longer exists.');
    const stored = await this.data.listEvidence(workspaceId, questionId);
    return { question, evidence: await Promise.all(stored.map((item) => this.resolve(item))) };
  }

  public list(workspaceId: string): Promise<readonly ResearchQuestion[]> {
    return this.data.listQuestions(workspaceId);
  }

  public update(input: UpdateResearchQuestionInput): Promise<ResearchQuestion> {
    return this.data.updateQuestion(input);
  }

  public setStatus(input: SetResearchQuestionStatusInput): Promise<ResearchQuestion> {
    return this.data.setQuestionStatus(input);
  }

  public archive(input: ArchiveResearchQuestionInput): Promise<ResearchQuestion> {
    return this.data.archiveQuestion(input);
  }

  public async delete(workspaceId: string, questionId: string): Promise<{ readonly id: string }> {
    if (!(await this.data.deleteQuestion(workspaceId, questionId))) {
      throw new LibraryError('NOT_FOUND', 'The Research Question no longer exists.');
    }
    return { id: questionId };
  }

  public async addZoteroEvidence(input: AddZoteroEvidenceInput): Promise<ResearchQuestionDetails> {
    const item = await this.zotero.getItem(input.itemRef);
    await this.data.addZoteroEvidence({
      ...input,
      pageNumber: input.pageNumber ?? null,
      textAnchor: input.textAnchor ?? null,
      itemVersion: item.version,
      sourceSnapshotIdentity: zoteroSnapshotIdentity(item.ref, item.version),
    });
    return this.get(input.workspaceId, input.questionId);
  }

  public async addCodeEvidence(input: AddCodeEvidenceInput): Promise<ResearchQuestionDetails> {
    const status = await this.code.getStatus(input.repositoryId);
    if (
      status.status !== 'ready' ||
      status.snapshotIdentity !== input.sourceSnapshotIdentity ||
      status.currentSnapshotIdentity !== input.sourceSnapshotIdentity
    ) {
      throw new LibraryError(
        'CONFLICT',
        'The code index changed. Refresh the code search before adding this Evidence.',
      );
    }
    await this.data.addCodeEvidence(input);
    return this.get(input.workspaceId, input.questionId);
  }

  public async removeEvidence(input: EvidenceIdentityInput): Promise<ResearchQuestionDetails> {
    if (!(await this.data.removeEvidence(input.workspaceId, input.questionId, input.evidenceId))) {
      throw new LibraryError('NOT_FOUND', 'The Evidence no longer exists.');
    }
    return this.get(input.workspaceId, input.questionId);
  }

  public async reorderEvidence(input: ReorderEvidenceInput): Promise<ResearchQuestionDetails> {
    await this.data.reorderEvidence(input.workspaceId, input.questionId, input.evidenceIds);
    return this.get(input.workspaceId, input.questionId);
  }

  public async openEvidence(input: EvidenceIdentityInput): Promise<OpenEvidenceResult> {
    const stored = await this.data.getEvidence(
      input.workspaceId,
      input.questionId,
      input.evidenceId,
    );
    if (!stored) throw new LibraryError('NOT_FOUND', 'The Evidence no longer exists.');
    const evidence = await this.resolve(stored);
    if (evidence.availability === 'unavailable') {
      return {
        evidenceId: evidence.id,
        opened: false,
        target: evidence.kind === 'code' ? 'code' : 'zotero_item',
        reason: evidence.availabilityReason,
      };
    }
    if (evidence.kind === 'code') {
      if (evidence.availability === 'stale') {
        return {
          evidenceId: evidence.id,
          opened: false,
          target: 'code',
          reason: evidence.availabilityReason,
        };
      }
      await this.repositoryNavigation.openInVscode({
        repositoryId: evidence.repositoryId,
        relativePath: evidence.relativePath,
        line: evidence.startLine,
      });
      return { evidenceId: evidence.id, opened: true, target: 'code', reason: null };
    }
    if (evidence.availability === 'available' && evidence.pageNumber !== null) {
      const attachment = await this.zotero.findPrimaryPdf(evidence.itemRef);
      if (attachment?.pdf.state === 'available') {
        await this.zoteroNavigation.openPdf(attachment.ref, evidence.pageNumber);
        return { evidenceId: evidence.id, opened: true, target: 'zotero_pdf', reason: null };
      }
    }
    await this.zoteroNavigation.openItem(evidence.itemRef);
    return {
      evidenceId: evidence.id,
      opened: true,
      target: 'zotero_item',
      reason:
        evidence.availability === 'stale'
          ? evidence.availabilityReason
          : evidence.pageNumber === null
            ? null
            : 'The referenced PDF page is not locally available; the Zotero item was opened instead.',
    };
  }

  private resolve(stored: StoredEvidence): Promise<EvidenceReference> {
    return stored.kind === 'zotero_paper' ? this.resolveZotero(stored) : this.resolveCode(stored);
  }

  private async resolveZotero(stored: StoredZoteroEvidence): Promise<ZoteroEvidenceReference> {
    try {
      const item = await this.zotero.getItem(stored.itemRef);
      const stale = item.version !== stored.itemVersion;
      return {
        ...stored,
        availability: stale ? 'stale' : 'available',
        availabilityReason: stale
          ? 'The Zotero item changed after this Evidence was recorded.'
          : null,
        item,
        pdf: item.pdf,
      };
    } catch {
      return {
        ...stored,
        availability: 'unavailable',
        availabilityReason: 'The Zotero item or its original Zotero profile is unavailable.',
        item: null,
        pdf: null,
      };
    }
  }

  private async resolveCode(stored: StoredCodeEvidence): Promise<CodeEvidenceReference> {
    const repository = await this.repositories.getRepository(stored.repositoryId);
    const memberships = await this.repositories.listWorkspaceRepositories(stored.workspaceId);
    if (!repository || !memberships.some(({ id }) => id === stored.repositoryId)) {
      return unavailableCode(stored, null, 'The repository is no longer linked to this Workspace.');
    }
    if (repository.availability !== 'available') {
      return unavailableCode(stored, repository.displayName, 'The repository is unavailable.');
    }
    const status = await this.code.getStatus(stored.repositoryId);
    const current = status.currentSnapshotIdentity;
    if (!current) {
      return unavailableCode(
        stored,
        repository.displayName,
        'The current source snapshot cannot be read.',
      );
    }
    if (current !== stored.sourceSnapshotIdentity) {
      return {
        ...stored,
        repositoryName: repository.displayName,
        availability: 'stale',
        availabilityReason: 'The repository content changed after this Evidence was recorded.',
        currentSnapshotIdentity: current,
      };
    }
    const exists = await this.data.codeLocationExists(stored);
    return {
      ...stored,
      repositoryName: repository.displayName,
      availability: exists ? 'available' : 'unavailable',
      availabilityReason: exists ? null : 'The indexed code location is no longer available.',
      currentSnapshotIdentity: current,
    };
  }
}

function zoteroSnapshotIdentity(ref: StoredZoteroEvidence['itemRef'], version: number): string {
  return `zotero:${ref.serverId}:${ref.library.type}:${ref.library.id}:${ref.itemKey}:v${String(version)}`;
}

function unavailableCode(
  stored: StoredCodeEvidence,
  repositoryName: string | null,
  reason: string,
): CodeEvidenceReference {
  return {
    ...stored,
    repositoryName,
    availability: 'unavailable',
    availabilityReason: reason,
    currentSnapshotIdentity: null,
  };
}
