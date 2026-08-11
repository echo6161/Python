// @vitest-environment node

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { CodeIndexManifest } from '../../src/main/code-intelligence/code-index-scanner';
import { CodeIntelligenceService } from '../../src/main/code-intelligence/code-intelligence-service';
import {
  CODE_PARSER_VERSION,
  parseCodeFile,
  type CodeParserInput,
  type ParsedCodeFile,
} from '../../src/main/code-intelligence/code-parser';
import { LibraryDatabase } from '../../src/main/database/library-database';
import { RepositoryError } from '../../src/main/repository/repository-errors';
import { GitRepositoryClient } from '../../src/main/repository/git-repository-client';
import { RepositoryFileService } from '../../src/main/repository/repository-file-service';
import { CodeIndexScanner } from '../../src/main/code-intelligence/code-index-scanner';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('Code Intelligence lifecycle', () => {
  it('records a repeatable medium fixture index and search measurement', async () => {
    const fixture = await createFixture();
    const files = Array.from({ length: 300 }, (_, index) =>
      source(
        `src/module-${String(index).padStart(3, '0')}.ts`,
        'typescript',
        `export function researchSymbol${String(index)}(): string {\n  return "evidence-${String(index)}";\n}\n`,
      ),
    );
    const service = new CodeIntelligenceService(
      fixture.database,
      fixture.database,
      new MutableScanner(manifest('snapshot:medium-300', files)),
      new RecordingParser(),
    );
    const heapBefore = process.memoryUsage().heapUsed;
    const indexStarted = performance.now();
    const status = await service.runIndex({
      repositoryId: fixture.repositoryId,
      requestId: crypto.randomUUID(),
      mode: 'rebuild',
    });
    const indexMs = performance.now() - indexStarted;
    const searchStarted = performance.now();
    const results = await service.searchSymbols(search(fixture.repositoryId, 'researchSymbol299'));
    const searchMs = performance.now() - searchStarted;
    const heapDeltaMiB = (process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024);

    expect(status).toMatchObject({ status: 'ready', fileCount: 300 });
    expect(results.results[0]).toMatchObject({
      relativePath: 'src/module-299.ts',
      symbolName: 'researchSymbol299',
    });
    console.info(
      `[code-intelligence-benchmark] files=300 indexMs=${indexMs.toFixed(1)} searchMs=${searchMs.toFixed(1)} heapDeltaMiB=${heapDeltaMiB.toFixed(1)}`,
    );
    await fixture.database.close();
  });

  it('scans only authorized source files and derives a changing content snapshot', async () => {
    const fixture = await createFixture();
    await mkdir(path.join(fixture.repositoryRoot, 'src'));
    await mkdir(path.join(fixture.repositoryRoot, 'node_modules'));
    await writeFile(
      path.join(fixture.repositoryRoot, 'src', 'main.py'),
      'def main():\n    return 1\n',
    );
    await writeFile(
      path.join(fixture.repositoryRoot, 'src', 'types.ts'),
      'export type Id = string;\n',
    );
    await writeFile(path.join(fixture.repositoryRoot, 'README.md'), '# Not indexed\n');
    await writeFile(path.join(fixture.repositoryRoot, '.env'), 'SECRET=not-indexed\n');
    await writeFile(
      path.join(fixture.repositoryRoot, 'node_modules', 'hidden.js'),
      'export const hidden = true;\n',
    );
    const git = new GitRepositoryClient();
    const scanner = new CodeIndexScanner(new RepositoryFileService(git), git);

    const first = await scanner.scan(fixture.repository);
    expect(first.dirty).toBe(true);
    expect(first.snapshotIdentity).toMatch(/^content:[0-9a-f]{64}$/u);
    expect(first.files.map(({ relativePath }) => relativePath)).toEqual([
      'src/main.py',
      'src/types.ts',
    ]);
    expect(first.files.map(({ content }) => content).join('\n')).not.toContain('SECRET');

    await writeFile(
      path.join(fixture.repositoryRoot, 'src', 'main.py'),
      'def main():\n    return 2\n',
    );
    const second = await scanner.scan(fixture.repository);
    expect(second.snapshotIdentity).not.toBe(first.snapshotIdentity);
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(scanner.scan(fixture.repository, cancelled.signal)).rejects.toMatchObject({
      code: 'CODE_INDEX_CANCELLED',
    });
    await fixture.database.close();
  });

  it('persists searchable indexes and incrementally handles modify, delete, and rename', async () => {
    const fixture = await createFixture();
    const scanner = new MutableScanner(
      manifest('snapshot:one', [
        source('src/analyze.py', 'python', 'def analyze_paper():\n    return "citation graph"\n'),
        source(
          'src/reader.ts',
          'typescript',
          'export class Reader {\n  open() { return "paper"; }\n}\n',
        ),
      ]),
    );
    const parser = new RecordingParser();
    const service = new CodeIntelligenceService(
      fixture.database,
      fixture.database,
      scanner,
      parser,
    );
    await service.initialize();

    const first = await service.runIndex({
      repositoryId: fixture.repositoryId,
      requestId: crypto.randomUUID(),
      mode: 'rebuild',
    });
    expect(first).toMatchObject({ status: 'ready', fileCount: 2, dirty: true });
    expect(parser.batches).toEqual([['src/analyze.py', 'src/reader.ts']]);
    expect(
      (await service.searchSymbols(search(fixture.repositoryId, 'analyze_paper'))).results[0],
    ).toMatchObject({
      relativePath: 'src/analyze.py',
      symbolKind: 'function',
      startLine: 1,
      stale: false,
    });
    expect(
      (await service.searchText(search(fixture.repositoryId, 'citation graph'))).results[0],
    ).toMatchObject({
      relativePath: 'src/analyze.py',
      startLine: 1,
    });

    scanner.current = manifest('snapshot:two', [
      source('src/analyze.py', 'python', 'def analyze_paper():\n    return "updated evidence"\n'),
      source(
        'src/source-reader.ts',
        'typescript',
        'export class Reader {\n  open() { return "paper"; }\n}\n',
      ),
    ]);
    const second = await service.runIndex({
      repositoryId: fixture.repositoryId,
      requestId: crypto.randomUUID(),
      mode: 'incremental',
    });

    expect(second).toMatchObject({
      status: 'ready',
      fileCount: 2,
      snapshotIdentity: 'snapshot:two',
    });
    expect(parser.batches[1]).toEqual(['src/analyze.py', 'src/source-reader.ts']);
    expect(
      (await service.searchFiles(search(fixture.repositoryId, 'reader'))).results.map(
        ({ relativePath }) => relativePath,
      ),
    ).toEqual(['src/source-reader.ts']);
    expect((await service.searchText(search(fixture.repositoryId, 'citation graph'))).total).toBe(
      0,
    );
    expect((await service.searchText(search(fixture.repositoryId, 'updated evidence'))).total).toBe(
      1,
    );

    const beforeRebuild = await service.searchSymbols(search(fixture.repositoryId, 'Reader'));
    await service.runIndex({
      repositoryId: fixture.repositoryId,
      requestId: crypto.randomUUID(),
      mode: 'rebuild',
    });
    const afterRebuild = await service.searchSymbols(search(fixture.repositoryId, 'Reader'));
    expect(afterRebuild.results.map(location)).toEqual(beforeRebuild.results.map(location));

    await fixture.database.close();
    const reopened = new LibraryDatabase(fixture.databasePath);
    expect(await reopened.getCodeIndexStatus(fixture.repositoryId)).toMatchObject({
      status: 'ready',
      fileCount: 2,
      snapshotIdentity: 'snapshot:two',
    });
    await reopened.close();
  });

  it('marks changed snapshots stale and leaves cancelled work recoverable', async () => {
    const fixture = await createFixture();
    const scanner = new MutableScanner(
      manifest('snapshot:one', [
        source('main.js', 'javascript', 'export function main() { return 1; }\n'),
      ]),
    );
    const service = new CodeIntelligenceService(
      fixture.database,
      fixture.database,
      scanner,
      new RecordingParser(),
    );
    await service.runIndex({
      repositoryId: fixture.repositoryId,
      requestId: crypto.randomUUID(),
      mode: 'rebuild',
    });
    scanner.current = manifest('snapshot:changed', scanner.current.files);
    expect(await service.getStatus(fixture.repositoryId)).toMatchObject({
      status: 'stale',
      snapshotIdentity: 'snapshot:one',
      currentSnapshotIdentity: 'snapshot:changed',
    });

    const cancelled = new AbortController();
    cancelled.abort();
    expect(
      await service.runIndex(
        {
          repositoryId: fixture.repositoryId,
          requestId: crypto.randomUUID(),
          mode: 'incremental',
        },
        cancelled.signal,
      ),
    ).toMatchObject({ status: 'cancelled', snapshotIdentity: 'snapshot:one' });

    const interruptedRequest = crypto.randomUUID();
    await fixture.database.beginCodeIndex(
      fixture.repositoryId,
      interruptedRequest,
      CODE_PARSER_VERSION,
      1,
      new Date().toISOString(),
    );
    await fixture.database.close();
    const reopened = new LibraryDatabase(fixture.databasePath);
    expect(await reopened.recoverInterruptedIndexes(new Date().toISOString())).toBe(1);
    expect(await reopened.getCodeIndexStatus(fixture.repositoryId)).toMatchObject({
      status: 'cancelled',
      lastErrorCode: 'INDEX_INTERRUPTED',
    });
    await reopened.close();
  });

  it('rejects a second active index task without replacing its request identity', async () => {
    const fixture = await createFixture();
    const firstRequest = crypto.randomUUID();
    await fixture.database.beginCodeIndex(
      fixture.repositoryId,
      firstRequest,
      CODE_PARSER_VERSION,
      10,
      new Date().toISOString(),
    );

    await expect(
      fixture.database.beginCodeIndex(
        fixture.repositoryId,
        crypto.randomUUID(),
        CODE_PARSER_VERSION,
        10,
        new Date().toISOString(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await fixture.database.getCodeIndexStatus(fixture.repositoryId)).toMatchObject({
      status: 'indexing',
      totalFiles: 10,
    });
    await fixture.database.close();
  });

  it('cancels during parsing and retains a retryable state', async () => {
    const fixture = await createFixture();
    const parser = new BlockingParser();
    const service = new CodeIntelligenceService(
      fixture.database,
      fixture.database,
      new MutableScanner(
        manifest('snapshot:cancel', [
          source('main.ts', 'typescript', 'export function waitForCancel() {}\n'),
        ]),
      ),
      parser,
    );
    const controller = new AbortController();
    const task = service.runIndex(
      {
        repositoryId: fixture.repositoryId,
        requestId: crypto.randomUUID(),
        mode: 'rebuild',
      },
      controller.signal,
    );
    await parser.started;
    controller.abort();

    expect(await task).toMatchObject({
      status: 'cancelled',
      lastErrorCode: 'CODE_INDEX_CANCELLED',
    });
    await fixture.database.close();
  });
});

class MutableScanner {
  public constructor(public current: CodeIndexManifest) {}

  public scan(
    _repository: unknown,
    signal?: AbortSignal,
    onFile?: (processed: number, relativePath: string) => void,
  ): Promise<CodeIndexManifest> {
    if (signal?.aborted) {
      return Promise.reject(
        new RepositoryError('CODE_INDEX_CANCELLED', 'Code indexing was cancelled.'),
      );
    }
    this.current.files.forEach((file, index) => onFile?.(index + 1, file.relativePath));
    return Promise.resolve(this.current);
  }
}

class RecordingParser {
  public readonly batches: string[][] = [];

  public parseFiles(files: readonly CodeParserInput[]): Promise<readonly ParsedCodeFile[]> {
    this.batches.push(files.map(({ relativePath }) => relativePath));
    return Promise.resolve(files.map(parseCodeFile));
  }
}

class BlockingParser {
  public readonly started: Promise<void>;
  private markStarted: (() => void) | null = null;

  public constructor() {
    this.started = new Promise((resolve) => {
      this.markStarted = resolve;
    });
  }

  public parseFiles(
    _files: readonly CodeParserInput[],
    signal?: AbortSignal,
  ): Promise<readonly ParsedCodeFile[]> {
    this.markStarted?.();
    return new Promise((_resolve, reject) => {
      const cancel = () =>
        reject(new RepositoryError('CODE_INDEX_CANCELLED', 'Code indexing was cancelled.'));
      if (signal?.aborted) cancel();
      else signal?.addEventListener('abort', cancel, { once: true });
    });
  }
}

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'papermind-code-index-'));
  roots.push(root);
  const databasePath = path.join(root, 'library.sqlite3');
  const repositoryRoot = path.join(root, 'repository');
  await mkdir(repositoryRoot);
  const database = new LibraryDatabase(databasePath);
  const now = new Date().toISOString();
  const repository = await database.createOrUpdateRepository({
    canonicalRoot: repositoryRoot,
    canonicalKey: repositoryRoot.toLocaleLowerCase(),
    displayName: 'fixture',
    kind: 'source_folder',
    gitRoot: null,
    currentBranch: null,
    headCommit: null,
    remotes: [],
    availability: 'available',
    lastErrorCode: null,
    observedAt: now,
  });
  return { database, databasePath, repository, repositoryId: repository.id, repositoryRoot };
}

function source(
  relativePath: string,
  language: CodeParserInput['language'],
  content: string,
): CodeParserInput {
  return {
    relativePath,
    language,
    content,
    contentHash: createHash('sha256').update(content).digest('hex'),
    byteSize: Buffer.byteLength(content),
  };
}

function manifest(snapshotIdentity: string, files: readonly CodeParserInput[]): CodeIndexManifest {
  return {
    snapshotIdentity,
    dirty: true,
    files,
    totalBytes: files.reduce((total, file) => total + file.byteSize, 0),
  };
}

function search(repositoryId: string, query: string) {
  return { repositoryId, query, offset: 0, limit: 20 };
}

function location(result: {
  readonly relativePath: string;
  readonly startLine: number;
  readonly endLine: number;
}) {
  return [result.relativePath, result.startLine, result.endLine];
}
