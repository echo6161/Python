import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import type {
  ResearchContentIdentityInput,
  ResearchContentItem,
  ResearchMemoryExportPreview,
  ResearchMemoryExportResult,
} from '../../shared/contracts/research-memory';
import { LibraryError } from '../library/errors';
import type { ResearchMemoryDataGateway } from './research-memory-data-gateway';

const PREVIEW_TTL_MS = 10 * 60_000;

interface PreparedExport {
  readonly ownerId: number;
  readonly root: string;
  readonly target: string;
  readonly preview: ResearchMemoryExportPreview;
  readonly item: ResearchContentItem;
}

export interface ResearchMemoryExportDirectoryPicker {
  chooseVaultDirectory(): Promise<string | null>;
}

export class MemoryExportService {
  private readonly prepared = new Map<string, PreparedExport>();

  public constructor(
    private readonly data: ResearchMemoryDataGateway,
    private readonly picker: ResearchMemoryExportDirectoryPicker,
  ) {}

  public async prepare(
    input: ResearchContentIdentityInput,
    ownerId: number,
  ): Promise<ResearchMemoryExportPreview | null> {
    this.removeExpired();
    const item = await this.data.getResearchContent(input);
    if (!item) throw new LibraryError('NOT_FOUND', 'The research item was not found.');
    const selected = await this.picker.chooseVaultDirectory();
    if (!selected) return null;
    const root = await realpath(selected);
    if (!(await stat(root)).isDirectory())
      throw new LibraryError('INVALID_INPUT', 'The selected Vault is not a directory.');
    const exportDirectory = path.join(root, 'PaperMind');
    await mkdir(exportDirectory, { recursive: true });
    const canonicalExportDirectory = containedPath(root, await realpath(exportDirectory));
    const baseName = `${safeFilename(item.title)}-${item.id.slice(0, 8)}.md`;
    const baseTarget = containedPath(root, path.join(canonicalExportDirectory, baseName));
    const conflict = await exists(baseTarget);
    const target = conflict
      ? await uniqueTarget(root, canonicalExportDirectory, baseName)
      : baseTarget;
    const existingPreview = conflict ? await readBoundedPreview(baseTarget) : null;
    const markdown = renderMarkdown(item);
    const id = randomUUID();
    const preview: ResearchMemoryExportPreview = {
      id,
      item: {
        id: item.id,
        type: item.type,
        title: item.title,
        status: item.status,
        referenceCount: item.references.length,
        updatedAt: item.updatedAt,
      },
      vaultName: path.basename(root),
      relativePath: path.relative(root, target).replaceAll(path.sep, '/'),
      markdown,
      conflict,
      existingPreview,
      expiresAt: new Date(Date.now() + PREVIEW_TTL_MS).toISOString(),
    };
    this.prepared.set(id, { ownerId, root, target, preview, item });
    return preview;
  }

  public async confirm(previewId: string, ownerId: number): Promise<ResearchMemoryExportResult> {
    this.removeExpired();
    const prepared = this.prepared.get(previewId);
    if (prepared?.ownerId !== ownerId) {
      throw new LibraryError('NOT_FOUND', 'The export preview expired. Prepare the export again.');
    }
    this.prepared.delete(previewId);
    const target = containedPath(prepared.root, prepared.target);
    await mkdir(path.dirname(target), { recursive: true });
    containedPath(prepared.root, await realpath(path.dirname(target)));
    let createdTarget = false;
    try {
      const targetHandle = await open(target, 'wx', 0o600);
      createdTarget = true;
      try {
        await targetHandle.writeFile(prepared.preview.markdown, { encoding: 'utf8' });
        await targetHandle.sync();
      } finally {
        await targetHandle.close();
      }
      await this.data.recordResearchExport({
        id: randomUUID(),
        workspaceId: prepared.item.workspaceId,
        ownerType: prepared.item.type,
        ownerId: prepared.item.id,
        vaultName: prepared.preview.vaultName,
        relativePath: prepared.preview.relativePath,
        contentHash: createHash('sha256').update(prepared.preview.markdown).digest('hex'),
        exportedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (createdTarget) await rm(target, { force: true });
      throw new LibraryError(
        'STORAGE_ERROR',
        'The Markdown export could not be completed. No existing note was overwritten.',
        { cause: error },
      );
    }
    return { filename: path.basename(target), relativePath: prepared.preview.relativePath };
  }

  private removeExpired(): void {
    const now = Date.now();
    for (const [id, prepared] of this.prepared) {
      if (Date.parse(prepared.preview.expiresAt) <= now) this.prepared.delete(id);
    }
  }
}

function renderMarkdown(item: ResearchContentItem): string {
  const references = item.references.length
    ? `\n\n## Sources\n\n${item.references.map((reference) => `- ${reference.citation}`).join('\n')}`
    : '';
  return [
    '---',
    `papermind-id: "${item.id}"`,
    `papermind-type: ${item.type}`,
    `status: ${item.status}`,
    `updated: ${item.updatedAt}`,
    '---',
    '',
    `# ${item.title}`,
    '',
    item.bodyMarkdown,
    references,
    '',
  ].join('\n');
}

function safeFilename(title: string): string {
  const cleaned = Array.from(title.trim())
    .map((character) =>
      character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '-' : character,
    )
    .join('')
    .replace(/[. ]+$/u, '')
    .slice(0, 100);
  return cleaned || 'research-note';
}

function containedPath(root: string, candidate: string): string {
  const normalizedRoot = path.resolve(root);
  const normalized = path.resolve(candidate);
  if (normalized !== normalizedRoot && !normalized.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new LibraryError('PERMISSION_DENIED', 'The export path is outside the selected Vault.');
  }
  return normalized;
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function uniqueTarget(root: string, directory: string, baseName: string): Promise<string> {
  const extension = path.extname(baseName);
  const stem = path.basename(baseName, extension);
  for (let index = 2; index <= 999; index += 1) {
    const candidate = containedPath(
      root,
      path.join(directory, `${stem}-${String(index)}${extension}`),
    );
    if (!(await exists(candidate))) return candidate;
  }
  throw new LibraryError('CONFLICT', 'The Vault contains too many exports with the same name.');
}

async function readBoundedPreview(candidate: string): Promise<string> {
  const handle = await open(candidate, 'r');
  try {
    const buffer = Buffer.alloc(4_000);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}
