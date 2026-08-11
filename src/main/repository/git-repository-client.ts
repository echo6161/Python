import { spawn } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';

import type { RepositoryKind, RepositoryRemoteSummary } from '../../shared/contracts/repository';
import { RepositoryError, mapFileSystemError } from './repository-errors';

const GIT_TIMEOUT_MS = 5_000;
const GIT_OUTPUT_LIMIT = 2 * 1024 * 1024;

export interface RepositoryInspection {
  readonly canonicalRoot: string;
  readonly kind: RepositoryKind;
  readonly gitRoot: string | null;
  readonly currentBranch: string | null;
  readonly headCommit: string | null;
  readonly remotes: readonly RepositoryRemoteSummary[];
}

export interface GitCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface GitCommandRunner {
  run(
    args: readonly string[],
    options?: { readonly input?: string; readonly signal?: AbortSignal },
  ): Promise<GitCommandResult>;
}

export class NodeGitCommandRunner implements GitCommandRunner {
  public run(
    args: readonly string[],
    options: { readonly input?: string; readonly signal?: AbortSignal } = {},
  ): Promise<GitCommandResult> {
    if (options.signal?.aborted) {
      return Promise.reject(
        new RepositoryError('REPOSITORY_CANCELLED', 'Repository request cancelled.'),
      );
    }
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, {
        env: {
          ...process.env,
          GIT_OPTIONAL_LOCKS: '0',
          GIT_TERMINAL_PROMPT: '0',
        },
        shell: false,
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let bytes = 0;
      let settled = false;
      const finish = (operation: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        operation();
      };
      const fail = (error: Error) => finish(() => reject(error));
      const capture = (target: Buffer[], chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > GIT_OUTPUT_LIMIT) {
          child.kill();
          fail(new RepositoryError('REPOSITORY_GIT_ERROR', 'Git output exceeded the safe limit.'));
          return;
        }
        target.push(chunk);
      };
      const abort = () => {
        child.kill();
        fail(new RepositoryError('REPOSITORY_CANCELLED', 'Repository request cancelled.'));
      };
      const timer = setTimeout(() => {
        child.kill();
        fail(new RepositoryError('REPOSITORY_GIT_ERROR', 'Git inspection timed out.'));
      }, GIT_TIMEOUT_MS);
      options.signal?.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', (chunk: Buffer) => capture(stdout, chunk));
      child.stderr.on('data', (chunk: Buffer) => capture(stderr, chunk));
      child.on('error', (error) =>
        fail(
          new RepositoryError('REPOSITORY_GIT_ERROR', 'Git could not be started.', {
            cause: error,
          }),
        ),
      );
      child.on('close', (exitCode) =>
        finish(() =>
          resolve({
            exitCode: exitCode ?? -1,
            stdout: Buffer.concat(stdout).toString('utf8'),
            stderr: Buffer.concat(stderr).toString('utf8'),
          }),
        ),
      );
      if (options.input !== undefined) child.stdin.end(options.input);
      else child.stdin.end();
    });
  }
}

export class GitRepositoryClient {
  public constructor(private readonly runner: GitCommandRunner = new NodeGitCommandRunner()) {}

  public async inspectSelectedRoot(
    selectedRoot: string,
    signal?: AbortSignal,
  ): Promise<RepositoryInspection> {
    let canonicalSelection: string;
    try {
      canonicalSelection = await realpath(selectedRoot);
      if (!(await stat(canonicalSelection)).isDirectory()) {
        throw new RepositoryError('INVALID_INPUT', 'The selected source is not a directory.');
      }
    } catch (error) {
      throw mapFileSystemError(error, 'The selected source directory could not be inspected.');
    }
    const topLevel = await this.runGit(
      canonicalSelection,
      ['rev-parse', '--show-toplevel'],
      signal,
    );
    if (topLevel.exitCode !== 0) return sourceFolderInspection(canonicalSelection);
    const reportedRoot = topLevel.stdout.trim();
    if (!reportedRoot) return sourceFolderInspection(canonicalSelection);
    let gitRoot: string;
    try {
      gitRoot = await realpath(reportedRoot);
    } catch (error) {
      throw mapFileSystemError(error, 'The Git root could not be resolved.');
    }
    return this.inspectGitRoot(gitRoot, signal);
  }

  public async inspectExistingRoot(
    root: string,
    signal?: AbortSignal,
  ): Promise<RepositoryInspection> {
    return this.inspectSelectedRoot(root, signal);
  }

  public async ignoredPaths(
    gitRoot: string,
    relativePaths: readonly string[],
    signal?: AbortSignal,
  ): Promise<ReadonlySet<string>> {
    if (relativePaths.length === 0) return new Set();
    const result = await this.runGit(
      gitRoot,
      ['check-ignore', '--stdin', '-z'],
      signal,
      `${relativePaths.join('\0')}\0`,
    );
    if (result.exitCode === 1) return new Set();
    if (result.exitCode !== 0) {
      throw new RepositoryError('REPOSITORY_GIT_ERROR', 'Git ignore rules could not be evaluated.');
    }
    return new Set(result.stdout.split('\0').filter(Boolean));
  }

  private async inspectGitRoot(root: string, signal?: AbortSignal): Promise<RepositoryInspection> {
    const [branchResult, headResult, remoteResult] = await Promise.all([
      this.runGit(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], signal),
      this.runGit(root, ['rev-parse', '--verify', 'HEAD'], signal),
      this.runGit(root, ['remote'], signal),
    ]);
    const remoteNames = remoteResult.exitCode === 0 ? lines(remoteResult.stdout).slice(0, 20) : [];
    const remotes: RepositoryRemoteSummary[] = [];
    for (const name of remoteNames) {
      const urlResult = await this.runGit(root, ['remote', 'get-url', name], signal);
      if (urlResult.exitCode === 0) {
        const url = sanitizeRemoteUrl(urlResult.stdout.trim());
        if (url) remotes.push({ name: name.slice(0, 200), url });
      }
    }
    const head = headResult.exitCode === 0 ? headResult.stdout.trim().toLowerCase() : null;
    return {
      canonicalRoot: root,
      kind: 'git',
      gitRoot: root,
      currentBranch: branchResult.exitCode === 0 ? branchResult.stdout.trim().slice(0, 1024) : null,
      headCommit: head && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(head) ? head : null,
      remotes,
    };
  }

  private runGit(
    root: string,
    command: readonly string[],
    signal?: AbortSignal,
    input?: string,
  ): Promise<GitCommandResult> {
    return this.runner.run(['--no-optional-locks', '-C', root, ...command], {
      ...(input === undefined ? {} : { input }),
      ...(signal === undefined ? {} : { signal }),
    });
  }
}

function sourceFolderInspection(root: string): RepositoryInspection {
  return {
    canonicalRoot: root,
    kind: 'source_folder',
    gitRoot: null,
    currentBranch: null,
    headCommit: null,
    remotes: [],
  };
}

function lines(value: string): readonly string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function sanitizeRemoteUrl(value: string): string {
  if (!value || value.length > 4096) return '';
  if (/^[a-zA-Z]:[\\/]|^\\\\|^\/[^/]/u.test(value)) return '<local remote>';
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'file:') return '<local remote>';
    if (!['git:', 'http:', 'https:', 'ssh:'].includes(parsed.protocol)) {
      return '<remote configured>';
    }
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().slice(0, 2048);
  } catch {
    const scp = /^(?:[^@\s]+@)?([^:\s]+):(.+)$/u.exec(value);
    if (scp?.[1] && scp[2]) return `${scp[1]}:${scp[2]}`.slice(0, 2048);
    return '<remote configured>';
  }
}
