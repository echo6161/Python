import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';

import { initialMigration } from './0001-initial';
import { readerAnnotationsMigration } from './0002-reader-annotations';
import { metadataOrganizationMigration } from './0003-metadata-organization';
import { workspaceCoreMigration } from './0004-workspace-core';
import { repositoryBridgeMigration } from './0005-repository-bridge';
import { codeIntelligenceMigration } from './0006-code-intelligence';
import { researchQuestionsEvidenceMigration } from './0007-research-questions-evidence';
import { paperCodeLinksMigration } from './0008-paper-code-links';
import type { DatabaseMigration } from './types';

export const DATABASE_MIGRATIONS: readonly DatabaseMigration[] = [
  initialMigration,
  readerAnnotationsMigration,
  metadataOrganizationMigration,
  workspaceCoreMigration,
  repositoryBridgeMigration,
  codeIntelligenceMigration,
  researchQuestionsEvidenceMigration,
  paperCodeLinksMigration,
];

interface AppliedMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
}

function checksumMigration(migration: DatabaseMigration): string {
  return createHash('sha256').update(migration.sql, 'utf8').digest('hex');
}

export function applyMigrations(database: Database.Database): readonly number[] {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      checksum TEXT NOT NULL
    ) STRICT;
  `);

  const applied = database
    .prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version')
    .all() as AppliedMigration[];
  const knownVersions = new Set(DATABASE_MIGRATIONS.map(({ version }) => version));

  for (const existing of applied) {
    const migration = DATABASE_MIGRATIONS.find(({ version }) => version === existing.version);
    if (!migration || !knownVersions.has(existing.version)) {
      throw new Error(
        `Database migration ${String(existing.version)} is newer than this application.`,
      );
    }

    if (migration.name !== existing.name || checksumMigration(migration) !== existing.checksum) {
      throw new Error(
        `Database migration ${String(existing.version)} does not match its recorded checksum.`,
      );
    }
  }

  const applyOne = database.transaction((migration: DatabaseMigration) => {
    database.exec(migration.sql);
    database
      .prepare(
        'INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)',
      )
      .run(
        migration.version,
        migration.name,
        new Date().toISOString(),
        checksumMigration(migration),
      );
  });

  for (const migration of DATABASE_MIGRATIONS) {
    if (!applied.some(({ version }) => version === migration.version)) {
      applyOne(migration);
    }
  }

  return database
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((row) => (row as { readonly version: number }).version);
}
