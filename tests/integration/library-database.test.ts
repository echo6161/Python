// @vitest-environment node

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { LibraryDatabase } from '../../src/main/database/library-database';
import { initialMigration } from '../../src/main/database/migrations/0001-initial';
import { PaperFileStorage } from '../../src/main/library/file-storage';
import { initializeLibraryPaths } from '../../src/main/library/library-paths';
import type { PaperDataGateway } from '../../src/main/library/paper-data-gateway';
import { PaperLibraryService } from '../../src/main/library/paper-library-service';
import { writePdfFixture } from '../helpers/pdf-fixture';

const temporaryRoots: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function createHarness() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'papermind-library-test-'));
  temporaryRoots.push(temporaryRoot);
  const sourceDirectory = path.join(temporaryRoot, 'source');
  const paths = await initializeLibraryPaths(path.join(temporaryRoot, 'library'));
  const database = new LibraryDatabase(paths.database);
  const storage = new PaperFileStorage(paths);
  const service = new PaperLibraryService(database, storage, paths);
  return { temporaryRoot, sourceDirectory, paths, database, storage, service };
}

async function sha256(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

describe('local paper library integration', () => {
  it('imports two PDFs, detects duplicates, persists records, and preserves source files', async () => {
    const harness = await createHarness();
    const firstSource = await writePdfFixture(harness.sourceDirectory, 'first-paper.pdf', 'First');
    const secondSource = await writePdfFixture(
      harness.sourceDirectory,
      'second-paper.pdf',
      'Second',
    );
    const sourceBefore = await Promise.all(
      [firstSource, secondSource].map(async (filePath) => ({
        hash: await sha256(filePath),
        modified: (await stat(filePath)).mtimeMs,
      })),
    );

    const firstImport = await harness.service.importPdfPaths([firstSource, secondSource]);
    expect(firstImport.items.map(({ status }) => status)).toEqual(['imported', 'imported']);
    expect((await harness.service.listPapers()).total).toBe(2);

    const duplicate = await harness.service.importPdfPaths([firstSource]);
    expect(duplicate.items[0]?.status).toBe('duplicate');
    expect((await harness.service.listPapers()).total).toBe(2);

    const managedFiles = (await readdir(harness.paths.papers, { recursive: true })).filter((file) =>
      file.endsWith('.pdf'),
    );
    expect(managedFiles).toHaveLength(2);

    await harness.database.close();
    const reopenedDatabase = new LibraryDatabase(harness.paths.database);
    const reopenedService = new PaperLibraryService(
      reopenedDatabase,
      harness.storage,
      harness.paths,
    );
    expect((await reopenedService.listPapers()).total).toBe(2);

    const sourceAfter = await Promise.all(
      [firstSource, secondSource].map(async (filePath) => ({
        hash: await sha256(filePath),
        modified: (await stat(filePath)).mtimeMs,
      })),
    );
    expect(sourceAfter).toEqual(sourceBefore);
    await reopenedDatabase.close();
  });

  it('supports CRUD, distinct deletion modes, and backup restoration', async () => {
    const harness = await createHarness();
    const source = await writePdfFixture(harness.sourceDirectory, 'crud-paper.pdf', 'CRUD');
    const imported = await harness.service.importPdfPaths([source]);
    const paper = imported.items[0]?.paper;
    expect(paper).not.toBeNull();
    if (!paper) {
      return;
    }

    const updated = await harness.service.updatePaperMetadata({
      id: paper.id,
      rowVersion: paper.rowVersion,
      title: 'Updated paper title',
      authors: ['Ada Lovelace', 'Alan Turing'],
      abstract: 'Local abstract',
      year: 2026,
      doi: '10.1000/papermind',
      venue: 'Local Systems',
      language: 'en',
    });
    expect(updated.title).toBe('Updated paper title');
    expect(updated.rowVersion).toBe(paper.rowVersion + 1);

    const backupPath = await harness.service.createDatabaseBackup();
    expect((await stat(backupPath)).size).toBeGreaterThan(0);

    const managedPath = harness.storage.resolveManagedPath(
      path.posix.join('papers', paper.file.sha256.slice(0, 2), paper.file.internalFilename),
    );
    await harness.service.removePaper({
      id: paper.id,
      mode: 'record-only',
      confirmation: 'REMOVE_PAPER',
    });
    expect((await stat(managedPath)).isFile()).toBe(true);

    await harness.service.restoreDatabaseBackup(backupPath);
    expect((await harness.service.listPapers()).total).toBe(1);
    const restored = await harness.service.getPaper(paper.id);
    await harness.service.removePaper({
      id: restored.id,
      mode: 'record-and-managed-file',
      confirmation: 'REMOVE_PAPER',
    });
    await expect(stat(managedPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await sha256(source)).toBe(paper.file.sha256);
    await harness.database.close();
  });

  it('applies migrations repeatedly and creates every Phase 2 entity table', async () => {
    const harness = await createHarness();
    expect(await harness.database.getMigrationVersions()).toEqual([1, 2, 3]);
    await harness.database.close();

    const reopened = new LibraryDatabase(harness.paths.database);
    expect(await reopened.getMigrationVersions()).toEqual([1, 2, 3]);
    await reopened.close();

    const database = new BetterSqlite3(harness.paths.database, { readonly: true });
    const tables = (
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        readonly name: string;
      }[]
    ).map(({ name }) => name);
    database.close();
    expect(tables).toEqual(
      expect.arrayContaining([
        'papers',
        'paper_files',
        'authors',
        'paper_authors',
        'collections',
        'collection_papers',
        'tags',
        'paper_tags',
        'annotations',
        'reading_states',
        'paper_metadata_fields',
        'document_pages',
        'notes',
        'settings',
        'ai_conversations',
        'ai_messages',
      ]),
    );
  });

  it('upgrades an existing Phase 2 database without rewriting migration 0001', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'papermind-migration-test-'));
    temporaryRoots.push(temporaryRoot);
    const databasePath = path.join(temporaryRoot, 'phase-2.sqlite3');
    const phaseTwoDatabase = new BetterSqlite3(databasePath);
    phaseTwoDatabase.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        checksum TEXT NOT NULL
      ) STRICT;
      ${initialMigration.sql}
    `);
    phaseTwoDatabase
      .prepare(
        'INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)',
      )
      .run(
        initialMigration.version,
        initialMigration.name,
        new Date().toISOString(),
        createHash('sha256').update(initialMigration.sql, 'utf8').digest('hex'),
      );
    const legacyPaperId = '550e8400-e29b-41d4-a716-446655440020';
    const legacyFileId = '550e8400-e29b-41d4-a716-446655440021';
    const legacyAuthorId = '550e8400-e29b-41d4-a716-446655440022';
    const unreviewedPaperId = '550e8400-e29b-41d4-a716-446655440030';
    const unreviewedFileId = '550e8400-e29b-41d4-a716-446655440031';
    const now = new Date().toISOString();
    phaseTwoDatabase
      .prepare(
        `INSERT INTO papers (
          id, title, abstract, year, doi, venue, language, status, metadata_source,
          created_at, updated_at, row_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', 'manual', ?, ?, 4)`,
      )
      .run(
        legacyPaperId,
        'User corrected legacy title',
        'User abstract',
        2024,
        '10.5555/legacy',
        'Local venue',
        'en',
        now,
        now,
      );
    phaseTwoDatabase
      .prepare(
        `INSERT INTO paper_files (
          id, paper_id, sha256, relative_path, internal_filename, original_filename,
          byte_size, mime_type, page_count, is_encrypted, imported_at, verified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'application/pdf', 1, 0, ?, ?)`,
      )
      .run(
        legacyFileId,
        legacyPaperId,
        'c'.repeat(64),
        `papers/cc/${'c'.repeat(64)}.pdf`,
        `${'c'.repeat(64)}.pdf`,
        'legacy.pdf',
        1024,
        now,
        now,
      );
    phaseTwoDatabase
      .prepare('UPDATE papers SET active_file_id = ? WHERE id = ?')
      .run(legacyFileId, legacyPaperId);
    phaseTwoDatabase
      .prepare(
        `INSERT INTO authors (id, display_name, normalized_name, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(legacyAuthorId, 'Legacy Linked Author', 'legacy linked author', now);
    phaseTwoDatabase
      .prepare(
        `INSERT INTO paper_authors (paper_id, author_id, position, role)
         VALUES (?, ?, 0, NULL)`,
      )
      .run(legacyPaperId, legacyAuthorId);
    phaseTwoDatabase
      .prepare(
        `INSERT INTO papers (
          id, title, abstract, year, doi, venue, language, status, metadata_source,
          created_at, updated_at, row_version
        ) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, 'ready', 'manual', ?, ?, 1)`,
      )
      .run(unreviewedPaperId, 'unreviewed-filename-title', now, now);
    phaseTwoDatabase
      .prepare(
        `INSERT INTO paper_files (
          id, paper_id, sha256, relative_path, internal_filename, original_filename,
          byte_size, mime_type, page_count, is_encrypted, imported_at, verified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'application/pdf', 1, 0, ?, ?)`,
      )
      .run(
        unreviewedFileId,
        unreviewedPaperId,
        'd'.repeat(64),
        `papers/dd/${'d'.repeat(64)}.pdf`,
        `${'d'.repeat(64)}.pdf`,
        'unreviewed-filename-title.pdf',
        2048,
        now,
        now,
      );
    phaseTwoDatabase
      .prepare('UPDATE papers SET active_file_id = ? WHERE id = ?')
      .run(unreviewedFileId, unreviewedPaperId);
    phaseTwoDatabase.close();

    const upgraded = new LibraryDatabase(databasePath);
    expect(await upgraded.getMigrationVersions()).toEqual([1, 2, 3]);
    const upgradedLegacy = await upgraded.getPaper(legacyPaperId);
    expect(upgradedLegacy).toMatchObject({
      title: 'User corrected legacy title',
      authors: ['Legacy Linked Author'],
      metadataReviewStatus: 'confirmed',
      file: { textExtractionStatus: 'pending' },
    });
    expect(
      upgradedLegacy?.metadataEvidence
        .filter(({ field }) => field !== 'authors')
        .every(
          ({ source, confidence, userEdited }) =>
            source === 'manual' && confidence === 'confirmed' && userEdited,
        ),
    ).toBe(true);
    expect(upgradedLegacy?.metadataEvidence.find(({ field }) => field === 'authors')).toMatchObject(
      {
        source: 'legacy',
        confidence: 'unconfirmed',
        userEdited: false,
      },
    );
    const unreviewed = await upgraded.getPaper(unreviewedPaperId);
    expect(unreviewed).toMatchObject({
      title: 'unreviewed-filename-title',
      authors: [],
      abstract: null,
      year: null,
      doi: null,
      metadataReviewStatus: 'pending',
      file: { textExtractionStatus: 'pending' },
    });
    expect(unreviewed?.metadataEvidence.find(({ field }) => field === 'title')).toMatchObject({
      source: 'filename',
      confidence: 'unconfirmed',
      userEdited: false,
    });
    expect(unreviewed?.metadataEvidence.find(({ field }) => field === 'authors')).toMatchObject({
      source: 'none',
      confidence: 'unconfirmed',
      userEdited: false,
    });
    await upgraded.close();
  });

  it('persists reading state and annotation CRUD across database restarts', async () => {
    const harness = await createHarness();
    const source = await writePdfFixture(harness.sourceDirectory, 'annotated.pdf', 'Selected text');
    const imported = await harness.service.importPdfPaths([source]);
    const paper = imported.items[0]?.paper;
    expect(paper).not.toBeNull();
    if (!paper) return;

    const created = await harness.database.createAnnotation({
      paperId: paper.id,
      pageNumber: 1,
      selectedText: 'Selected text',
      textQuotePrefix: 'Before ',
      textQuoteSuffix: ' after',
      textStart: 7,
      textEnd: 20,
      boundingRects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
      annotationType: 'highlight',
      color: 'yellow',
      comment: 'Important result',
    });
    await harness.database.saveReadingState({ paperId: paper.id, pageNumber: 1, scale: 1.35 });
    const updated = await harness.database.updateAnnotation({
      id: created.id,
      rowVersion: created.rowVersion,
      annotationType: 'underline',
      color: 'blue',
      comment: 'Revised comment',
    });
    expect(updated.rowVersion).toBe(2);
    await harness.database.close();

    const reopened = new LibraryDatabase(harness.paths.database);
    expect(await reopened.getReadingState(paper.id)).toMatchObject({ pageNumber: 1, scale: 1.35 });
    expect(await reopened.listAnnotations(paper.id)).toEqual([
      expect.objectContaining({
        id: created.id,
        annotationType: 'underline',
        comment: 'Revised comment',
      }),
    ]);
    await reopened.deleteAnnotation(updated.id, updated.rowVersion);
    expect(await reopened.listAnnotations(paper.id)).toEqual([]);
    await reopened.close();
  });

  it('removes staged and managed files when an import transaction fails', async () => {
    const harness = await createHarness();
    const source = await writePdfFixture(harness.sourceDirectory, 'rollback.pdf', 'Rollback');
    const originalHash = await sha256(source);
    const failingGateway: PaperDataGateway = {
      listPapers: (query) => harness.database.listPapers(query),
      getPaper: (id) => harness.database.getPaper(id),
      findPaperByHash: (hash) => harness.database.findPaperByHash(hash),
      createImportedPaper: () => Promise.reject(new Error('simulated database failure')),
      updatePaperDetails: (input) => harness.database.updatePaperDetails(input),
      updatePaperMetadata: (input) => harness.database.updatePaperMetadata(input),
      updatePaperOrganization: (input) => harness.database.updatePaperOrganization(input),
      batchUpdatePapers: (input) => harness.database.batchUpdatePapers(input),
      listOrganization: () => harness.database.listOrganization(),
      createTag: (input) => harness.database.createTag(input),
      deleteTag: (id) => harness.database.deleteTag(id),
      createCollection: (input) => harness.database.createCollection(input),
      deleteCollection: (id) => harness.database.deleteCollection(id),
      listPendingPaperTextExtractions: () => harness.database.listPendingPaperTextExtractions(),
      savePaperTextExtraction: (input) => harness.database.savePaperTextExtraction(input),
      removePaperRecord: (id) => harness.database.removePaperRecord(id),
      getManagedPaperFile: (paperId) => harness.database.getManagedPaperFile(paperId),
      listAnnotations: (paperId) => harness.database.listAnnotations(paperId),
      createAnnotation: (input) => harness.database.createAnnotation(input),
      updateAnnotation: (input) => harness.database.updateAnnotation(input),
      deleteAnnotation: (id, rowVersion) => harness.database.deleteAnnotation(id, rowVersion),
      getReadingState: (paperId) => harness.database.getReadingState(paperId),
      saveReadingState: (input) => harness.database.saveReadingState(input),
      backupTo: (destinationPath) => harness.database.backupTo(destinationPath),
      restoreFrom: (sourcePath) => harness.database.restoreFrom(sourcePath),
      getMigrationVersions: () => harness.database.getMigrationVersions(),
      close: () => harness.database.close(),
    };
    const service = new PaperLibraryService(failingGateway, harness.storage, harness.paths);

    const result = await service.importPdfPaths([source]);
    expect(result.items[0]?.status).toBe('failed');
    expect(await readdir(harness.paths.temporary)).toHaveLength(0);
    expect(
      (await readdir(harness.paths.papers, { recursive: true })).filter((file) =>
        file.endsWith('.pdf'),
      ),
    ).toHaveLength(0);
    expect(await sha256(source)).toBe(originalHash);
    await harness.database.close();
  });
});
