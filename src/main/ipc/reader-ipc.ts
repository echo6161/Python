import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { dialog, ipcMain, type BrowserWindow } from 'electron';

import {
  READER_IPC_CHANNELS,
  type Annotation,
  type AnnotationExportResult,
  type PdfAccess,
  type ReadingState,
} from '../../shared/contracts/reader';
import type { PaperReaderService } from '../reader/paper-reader-service';
import { invokeValidated } from './library-ipc';
import { paperIdSchema } from './library-schemas';
import {
  annotationExportRequestSchema,
  annotationExportResultSchema,
  annotationListSchema,
  annotationSchema,
  createAnnotationSchema,
  deletedAnnotationSchema,
  deleteAnnotationSchema,
  pdfAccessSchema,
  readingStateSchema,
  saveReadingStateSchema,
  updateAnnotationSchema,
} from './reader-schemas';

export function registerReaderIpcHandlers(
  reader: PaperReaderService,
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(READER_IPC_CHANNELS.getPdfAccess, (event, input: unknown) =>
    invokeValidated<PdfAccess>(event, pdfAccessSchema, () =>
      reader.issuePdfAccess(paperIdSchema.parse(input)),
    ),
  );
  ipcMain.handle(READER_IPC_CHANNELS.getReadingState, (event, input: unknown) =>
    invokeValidated<ReadingState | null>(event, readingStateSchema.nullable(), () =>
      reader.getReadingState(paperIdSchema.parse(input)),
    ),
  );
  ipcMain.handle(READER_IPC_CHANNELS.saveReadingState, (event, input: unknown) =>
    invokeValidated<ReadingState>(event, readingStateSchema, () =>
      reader.saveReadingState(saveReadingStateSchema.parse(input)),
    ),
  );
  ipcMain.handle(READER_IPC_CHANNELS.listAnnotations, (event, input: unknown) =>
    invokeValidated<readonly Annotation[]>(event, annotationListSchema, () =>
      reader.listAnnotations(paperIdSchema.parse(input)),
    ),
  );
  ipcMain.handle(READER_IPC_CHANNELS.createAnnotation, (event, input: unknown) =>
    invokeValidated<Annotation>(event, annotationSchema, () =>
      reader.createAnnotation(createAnnotationSchema.parse(input)),
    ),
  );
  ipcMain.handle(READER_IPC_CHANNELS.updateAnnotation, (event, input: unknown) =>
    invokeValidated<Annotation>(event, annotationSchema, () =>
      reader.updateAnnotation(updateAnnotationSchema.parse(input)),
    ),
  );
  ipcMain.handle(READER_IPC_CHANNELS.deleteAnnotation, (event, input: unknown) =>
    invokeValidated(event, deletedAnnotationSchema, () => {
      const deletion = deleteAnnotationSchema.parse(input);
      return reader.deleteAnnotation(deletion.id, deletion.rowVersion);
    }),
  );
  ipcMain.handle(READER_IPC_CHANNELS.exportAnnotations, (event, input: unknown) =>
    invokeValidated<AnnotationExportResult>(event, annotationExportResultSchema, async () => {
      const request = annotationExportRequestSchema.parse(input);
      const exported = await reader.buildAnnotationExport(request.paperId, request.format);
      const invalidFilenameCharacters = '<>:"/\\|?*';
      const title = Array.from(exported.paper.title)
        .map((character) =>
          character.charCodeAt(0) < 32 || invalidFilenameCharacters.includes(character)
            ? '_'
            : character,
        )
        .join('')
        .slice(0, 100);
      const defaultPath = `${title || 'paper'}-annotations.${exported.document.extension}`;
      const options = {
        title: 'Export annotations',
        buttonLabel: 'Export',
        defaultPath,
        filters: [
          request.format === 'json'
            ? { name: 'JSON', extensions: ['json'] }
            : { name: 'Markdown', extensions: ['md'] },
        ],
      };
      const owner = getMainWindow();
      const selection = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
      if (selection.canceled || !selection.filePath) {
        return { cancelled: true, filename: null, annotationCount: exported.annotations.length };
      }
      const temporaryPath = `${selection.filePath}.${randomUUID()}.partial`;
      try {
        await writeFile(temporaryPath, exported.document.content, {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        });
        await rename(temporaryPath, selection.filePath);
      } finally {
        await rm(temporaryPath, { force: true });
      }
      return {
        cancelled: false,
        filename: path.basename(selection.filePath),
        annotationCount: exported.annotations.length,
      };
    }),
  );
}
