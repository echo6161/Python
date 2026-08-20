import { randomUUID } from 'node:crypto';
import type {
  CreateExperimentInput,
  Experiment,
  ExperimentApi,
  UpdateExperimentInput,
} from '../../shared/contracts/experiment';
import type { QuestionDataGateway } from '../question/question-data-gateway';
import type { RepositoryDataGateway } from '../repository/repository-data-gateway';
import { LibraryError } from '../library/errors';
import type { ExperimentDataGateway } from './experiment-data-gateway';
import type { ConclusionProposalGenerator } from './conclusion-proposal-generator';
export class ExperimentService {
  constructor(
    private readonly data: ExperimentDataGateway,
    private readonly questions: QuestionDataGateway,
    private readonly repositories: RepositoryDataGateway,
    private readonly generator: ConclusionProposalGenerator,
  ) {}
  async list(w: string) {
    return Promise.all((await this.data.listExperiments(w)).map((e) => this.hydrate(e)));
  }
  async get(w: string, id: string) {
    const e = await this.data.getExperiment(w, id);
    if (!e) throw new LibraryError('NOT_FOUND', 'The Experiment does not exist.');
    return this.hydrate(e);
  }
  async create(i: CreateExperimentInput) {
    await this.validateRefs(i);
    return this.hydrate(await this.data.createExperiment(i));
  }
  async update(i: UpdateExperimentInput) {
    await this.validateRefs(i);
    return this.hydrate(await this.data.updateExperiment(i));
  }
  setStatus(i: Parameters<ExperimentApi['setStatus']>[0]) {
    return this.data
      .setExperimentStatus(i.workspaceId, i.experimentId, i.status, i.rowVersion)
      .then((e) => this.hydrate(e));
  }
  async delete(w: string, id: string) {
    if (!(await this.data.deleteExperiment(w, id)))
      throw new LibraryError('NOT_FOUND', 'The Experiment does not exist.');
    return { id };
  }
  addRun(i: Parameters<ExperimentApi['addRun']>[0]) {
    return this.data.addExperimentRun(i).then((e) => this.hydrate(e));
  }
  updateRun(i: Parameters<ExperimentApi['updateRun']>[0]) {
    return this.data.updateExperimentRun(i).then((e) => this.hydrate(e));
  }
  deleteRun(i: Parameters<ExperimentApi['deleteRun']>[0]) {
    return this.data
      .deleteExperimentRun(i.workspaceId, i.experimentId, i.runId)
      .then((e) => this.hydrate(e));
  }
  recordResult(i: Parameters<ExperimentApi['recordResult']>[0]) {
    return this.data.recordExperimentResult(i).then((e) => this.hydrate(e));
  }
  createConclusion(i: Parameters<ExperimentApi['createConclusion']>[0]) {
    return this.data
      .createExperimentConclusion(i.workspaceId, i.experimentId, i.resultId, i.statement, 'manual')
      .then((e) => this.hydrate(e));
  }
  updateConclusion(i: Parameters<ExperimentApi['updateConclusion']>[0]) {
    return this.data
      .updateExperimentConclusion(
        i.workspaceId,
        i.experimentId,
        i.conclusionId,
        i.statement,
        i.status,
        i.rowVersion,
      )
      .then((e) => this.hydrate(e));
  }
  async generateProposal(i: { workspaceId: string; experimentId: string; instruction: string }) {
    const e = await this.get(i.workspaceId, i.experimentId),
      g = await this.generator.generate(e, i.instruction);
    return this.data.createExperimentConclusionProposal({
      id: randomUUID(),
      workspaceId: i.workspaceId,
      experimentId: i.experimentId,
      ...g,
      createdAt: new Date().toISOString(),
    });
  }
  confirmProposal(i: Parameters<ExperimentApi['confirmProposal']>[0]) {
    return this.data.confirmExperimentConclusionProposal(i).then((e) => this.hydrate(e));
  }
  rejectProposal(i: Parameters<ExperimentApi['rejectProposal']>[0]) {
    return this.data.rejectExperimentConclusionProposal(
      i.workspaceId,
      i.experimentId,
      i.proposalId,
      i.rowVersion,
    );
  }
  private async validateRefs(i: CreateExperimentInput) {
    if (i.questionId && !(await this.questions.getQuestion(i.workspaceId, i.questionId)))
      throw new LibraryError('INVALID_INPUT', 'The Research Question is not in this Workspace.');
    if (Boolean(i.repositoryId) !== Boolean(i.codeSnapshotIdentity))
      throw new LibraryError(
        'INVALID_INPUT',
        'Repository and code snapshot must be supplied together.',
      );
    if (i.repositoryId) {
      const repo = (await this.repositories.listWorkspaceRepositories(i.workspaceId)).find(
        (r) => r.id === i.repositoryId,
      );
      if (!repo)
        throw new LibraryError('INVALID_INPUT', 'The Repository is not in this Workspace.');
      if (repo.headCommit !== i.codeSnapshotIdentity)
        throw new LibraryError(
          'CONFLICT',
          'The selected code snapshot is not the current observed commit.',
        );
    }
  }
  private async hydrate(e: Experiment): Promise<Experiment> {
    let q: 'available' | 'unavailable' = 'available',
      r: 'available' | 'stale' | 'unavailable' = 'available',
      reason: string | null = null;
    if (e.questionId && !(await this.questions.getQuestion(e.workspaceId, e.questionId))) {
      q = 'unavailable';
      reason = 'The linked Research Question is unavailable.';
    }
    if (e.repositoryId) {
      const repo = (await this.repositories.listWorkspaceRepositories(e.workspaceId)).find(
        (x) => x.id === e.repositoryId,
      );
      if (repo?.availability !== 'available') {
        r = 'unavailable';
        reason ??= 'The linked Repository is unavailable.';
      } else if (repo.headCommit !== e.codeSnapshotIdentity) {
        r = 'stale';
        reason ??= 'The Repository HEAD changed; the recorded snapshot was preserved.';
      }
    }
    return { ...e, availability: { question: q, repository: r, reason } };
  }
}
