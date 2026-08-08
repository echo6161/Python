import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

import type { Session } from 'electron';

import type { PaperReaderService } from './paper-reader-service';

export function registerPdfProtocol(electronSession: Session, reader: PaperReaderService): void {
  electronSession.protocol.handle('papermind-pdf', async (request) => {
    try {
      const { absolutePath } = await reader.resolvePdfRequest(request.url);
      const metadata = await stat(absolutePath);
      const range = parseRange(request, metadata.size);
      const headers = new Headers({
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/pdf',
      });
      if (range) {
        headers.set('Content-Length', String(range.end - range.start + 1));
        headers.set(
          'Content-Range',
          `bytes ${String(range.start)}-${String(range.end)}/${String(metadata.size)}`,
        );
      } else {
        headers.set('Content-Length', String(metadata.size));
      }
      if (request.method === 'HEAD') {
        return new Response(null, { status: range ? 206 : 200, headers });
      }
      const stream = createReadStream(absolutePath, range ?? undefined);
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: range ? 206 : 200,
        headers,
      });
    } catch {
      return new Response('PDF not found', { status: 404 });
    }
  });
}

function parseRange(
  request: Request,
  size: number,
): { readonly start: number; readonly end: number } | null {
  const value = request.headers.get('Range');
  const match = /^bytes=(\d+)-(\d*)$/i.exec(value ?? '');
  if (!match) return null;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) return null;
  return { start, end: Math.min(requestedEnd, size - 1) };
}
