import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { ZodType } from 'zod';

import type { ApiResult } from '../../shared/contracts/library';
import {
  QUESTION_IPC_CHANNELS,
  type ResearchQuestion,
  type ResearchQuestionDetails,
} from '../../shared/contracts/question';
import { createConsoleLogger } from '../../shared/logging';
import { LibraryError, toApiError } from '../library/errors';
import { RepositoryError, toRepositoryApiError } from '../repository/repository-errors';
import type { QuestionService } from '../question/question-service';
import { ZoteroBridgeError, toZoteroApiError } from '../zotero/zotero-errors';
import { ensureTrustedSender } from './library-ipc';
import {
  addCodeEvidenceSchema,
  addZoteroEvidenceSchema,
  archiveQuestionSchema,
  createQuestionSchema,
  deletedQuestionSchema,
  deleteQuestionSchema,
  evidenceIdentitySchema,
  getQuestionSchema,
  listQuestionsSchema,
  openEvidenceResultSchema,
  questionDetailsSchema,
  questionListSchema,
  reorderEvidenceSchema,
  researchQuestionSchema,
  setQuestionStatusSchema,
  updateQuestionSchema,
} from './question-schemas';

const logger = createConsoleLogger('question-ipc');

export function registerQuestionIpcHandlers(service: QuestionService): void {
  ipcMain.handle(QUESTION_IPC_CHANNELS.create, (event, input: unknown) =>
    invokeQuestionValidated(event, researchQuestionSchema, () =>
      service.create(createQuestionSchema.parse(input)),
    ),
  );
  ipcMain.handle(QUESTION_IPC_CHANNELS.get, (event, input: unknown) =>
    invokeQuestionValidated<ResearchQuestionDetails>(event, questionDetailsSchema, () => {
      const parsed = getQuestionSchema.parse(input);
      return service.get(parsed.workspaceId, parsed.questionId);
    }),
  );
  ipcMain.handle(QUESTION_IPC_CHANNELS.list, (event, input: unknown) =>
    invokeQuestionValidated<readonly ResearchQuestion[]>(event, questionListSchema, () =>
      service.list(listQuestionsSchema.parse(input)),
    ),
  );
  ipcMain.handle(QUESTION_IPC_CHANNELS.update, (event, input: unknown) =>
    invokeQuestionValidated(event, researchQuestionSchema, () =>
      service.update(updateQuestionSchema.parse(input)),
    ),
  );
  ipcMain.handle(QUESTION_IPC_CHANNELS.setStatus, (event, input: unknown) =>
    invokeQuestionValidated(event, researchQuestionSchema, () =>
      service.setStatus(setQuestionStatusSchema.parse(input)),
    ),
  );
  ipcMain.handle(QUESTION_IPC_CHANNELS.archive, (event, input: unknown) =>
    invokeQuestionValidated(event, researchQuestionSchema, () =>
      service.archive(archiveQuestionSchema.parse(input)),
    ),
  );
  ipcMain.handle(QUESTION_IPC_CHANNELS.delete, (event, input: unknown) =>
    invokeQuestionValidated(event, deletedQuestionSchema, () => {
      const parsed = deleteQuestionSchema.parse(input);
      return service.delete(parsed.workspaceId, parsed.questionId);
    }),
  );
  ipcMain.handle(QUESTION_IPC_CHANNELS.addZoteroEvidence, (event, input: unknown) =>
    invokeQuestionValidated(event, questionDetailsSchema, () => {
      const parsed = addZoteroEvidenceSchema.parse(input);
      return service.addZoteroEvidence({
        workspaceId: parsed.workspaceId,
        questionId: parsed.questionId,
        itemRef: parsed.itemRef,
        note: parsed.note,
        ...(parsed.pageNumber === undefined ? {} : { pageNumber: parsed.pageNumber }),
        ...(parsed.textAnchor === undefined ? {} : { textAnchor: parsed.textAnchor }),
      });
    }),
  );
  ipcMain.handle(QUESTION_IPC_CHANNELS.addCodeEvidence, (event, input: unknown) =>
    invokeQuestionValidated(event, questionDetailsSchema, () =>
      service.addCodeEvidence(addCodeEvidenceSchema.parse(input)),
    ),
  );
  ipcMain.handle(QUESTION_IPC_CHANNELS.removeEvidence, (event, input: unknown) =>
    invokeQuestionValidated(event, questionDetailsSchema, () =>
      service.removeEvidence(evidenceIdentitySchema.parse(input)),
    ),
  );
  ipcMain.handle(QUESTION_IPC_CHANNELS.reorderEvidence, (event, input: unknown) =>
    invokeQuestionValidated(event, questionDetailsSchema, () =>
      service.reorderEvidence(reorderEvidenceSchema.parse(input)),
    ),
  );
  ipcMain.handle(QUESTION_IPC_CHANNELS.openEvidence, (event, input: unknown) =>
    invokeQuestionValidated(event, openEvidenceResultSchema, () =>
      service.openEvidence(evidenceIdentitySchema.parse(input)),
    ),
  );
}

export async function invokeQuestionValidated<T>(
  event: IpcMainInvokeEvent,
  outputSchema: ZodType<T>,
  operation: () => Promise<T>,
): Promise<ApiResult<T>> {
  try {
    ensureTrustedSender(event);
    return { ok: true, value: outputSchema.parse(await operation()) };
  } catch (error) {
    const safeError =
      error instanceof ZoteroBridgeError
        ? toZoteroApiError(error)
        : error instanceof RepositoryError
          ? toRepositoryApiError(error)
          : toApiError(
              error instanceof LibraryError || !(error instanceof Error)
                ? error
                : new LibraryError('INVALID_INPUT', 'The Question request was invalid.', {
                    cause: error,
                  }),
            );
    logger.warn('Question request rejected', { code: safeError.code });
    return { ok: false, error: safeError };
  }
}
