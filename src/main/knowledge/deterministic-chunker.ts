import { createHash } from 'node:crypto';

const MAX_CHUNK_CHARACTERS = 1_800;
const OVERLAP_CHARACTERS = 180;

export interface DeterministicTextChunk {
  readonly content: string;
  readonly contentHash: string;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function chunkText(value: string): readonly DeterministicTextChunk[] {
  const normalized = value
    .replaceAll('\r\n', '\n')
    .replace(/[ \t]+/gu, ' ')
    .trim();
  if (!normalized) return [];
  const chunks: DeterministicTextChunk[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + MAX_CHUNK_CHARACTERS, normalized.length);
    if (end < normalized.length) {
      const boundary = Math.max(
        normalized.lastIndexOf('\n\n', end),
        normalized.lastIndexOf('. ', end),
        normalized.lastIndexOf('。', end),
      );
      if (boundary > start + Math.floor(MAX_CHUNK_CHARACTERS * 0.55)) end = boundary + 1;
    }
    const content = normalized.slice(start, end).trim();
    if (content) chunks.push({ content, contentHash: sha256(content) });
    if (end >= normalized.length) break;
    start = Math.max(end - OVERLAP_CHARACTERS, start + 1);
  }
  return chunks;
}
