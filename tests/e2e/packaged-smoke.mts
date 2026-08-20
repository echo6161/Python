import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { listPackage } from '@electron/asar';
import { _electron as electron, type ElectronApplication } from '@playwright/test';
import BetterSqlite3 from 'better-sqlite3';

import packageMetadata from '../../package.json' with { type: 'json' };

interface PackagePaths {
  readonly appRoot: string;
  readonly executablePath: string;
}

async function findMacBundle(): Promise<PackagePaths> {
  const releaseRoot = path.resolve('release');
  const entries = await readdir(releaseRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('mac')) continue;
    const appRoot = path.join(releaseRoot, entry.name, 'PaperMind.app');
    const executablePath = path.join(appRoot, 'Contents', 'MacOS', 'PaperMind');
    if (existsSync(executablePath)) return { appRoot, executablePath };
  }
  throw new Error('No packaged PaperMind.app was found under release/.');
}

async function findPackage(): Promise<PackagePaths> {
  if (process.platform === 'win32') {
    const appRoot = path.resolve('release/win-unpacked');
    const executablePath = path.join(appRoot, 'PaperMind.exe');
    if (!existsSync(executablePath)) throw new Error('PaperMind.exe was not packaged.');
    return { appRoot, executablePath };
  }
  if (process.platform === 'darwin') return findMacBundle();
  throw new Error(`Packaged smoke does not claim support for ${process.platform}.`);
}

function inspectAsar(appRoot: string): number {
  const asarPath =
    process.platform === 'darwin'
      ? path.join(appRoot, 'Contents', 'Resources', 'app.asar')
      : path.join(appRoot, 'resources', 'app.asar');
  const entries = listPackage(asarPath, { isPack: false }).map((entry) =>
    entry.replaceAll(String.fromCharCode(92), '/').toLowerCase(),
  );
  const fontCount = entries.filter((entry) =>
    entry.includes('/dist/renderer/standard_fonts/'),
  ).length;
  const forbidden = entries.filter(
    (entry) =>
      entry.includes('/.env') ||
      entry.endsWith('.sqlite') ||
      entry.endsWith('.sqlite3') ||
      entry.endsWith('.db') ||
      entry.endsWith('.pdf') ||
      entry.includes('/node_modules/.cache'),
  );
  if (fontCount !== 17) {
    throw new Error(`Expected 17 renderer font files, found ${String(fontCount)}.`);
  }
  if (forbidden.length > 0) {
    throw new Error(`Forbidden packaged files: ${JSON.stringify(forbidden)}`);
  }
  return fontCount;
}

async function main(): Promise<void> {
  const packagePaths = await findPackage();
  const libraryRoot = await mkdtemp(path.join(os.tmpdir(), 'papermind-packaged-smoke-'));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env.NODE_ENV = 'test';
  env.PAPERMIND_LIBRARY_ROOT = libraryRoot;
  env.PAPERMIND_USER_DATA_ROOT = path.join(libraryRoot, '.user');
  env.PAPERMIND_AI_PROVIDER = 'mock';
  delete env.ELECTRON_RUN_AS_NODE;

  let application: ElectronApplication | undefined;
  try {
    const fontCount = inspectAsar(packagePaths.appRoot);
    application = await electron.launch({
      executablePath: packagePaths.executablePath,
      args: ['--disable-gpu'],
      env,
      timeout: 60_000,
    });
    const window = await application.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.getByText(`v${packageMetadata.version}`, { exact: true }).waitFor({
      timeout: 15_000,
    });
    if ((await window.title()) !== 'PaperMind') throw new Error('Unexpected packaged title.');
    await application.close();
    application = undefined;

    const database = new BetterSqlite3(path.join(libraryRoot, 'library.sqlite3'), {
      readonly: true,
    });
    const migrations = (
      database.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
        readonly version: number;
      }[]
    ).map((row) => row.version);
    database.close();
    const expected = Array.from({ length: 15 }, (_, index) => index + 1);
    if (JSON.stringify(migrations) !== JSON.stringify(expected)) {
      throw new Error(`Unexpected migration versions: ${JSON.stringify(migrations)}`);
    }
    console.log(
      JSON.stringify(
        {
          architecture: process.arch,
          fontCount,
          migrations,
          platform: process.platform,
          title: 'PaperMind',
          version: packageMetadata.version,
        },
        null,
        2,
      ),
    );
  } finally {
    if (application) await application.close().catch(() => undefined);
    await rm(libraryRoot, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
