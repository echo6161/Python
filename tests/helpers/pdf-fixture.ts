import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface PdfFixtureLine {
  readonly text: string;
  readonly fontSize: number;
  readonly x?: number;
  readonly y: number;
}

export interface StructuredPdfFixture {
  readonly pages: readonly (readonly PdfFixtureLine[])[];
  readonly metadata?: {
    readonly title?: string;
    readonly author?: string;
    readonly subject?: string;
    readonly keywords?: string;
  };
}

function escapePdfText(value: string): string {
  return value.replaceAll(/([()\\])/g, '\\$1').replaceAll(/[^\x20-\x7e]/g, '');
}

export function createMinimalPdf(label: string | readonly string[]): Buffer {
  const labels = (typeof label === 'string' ? [label] : label).map((value) =>
    value.replaceAll(/[()\\]/g, ''),
  );
  const kids = labels.map((_, index) => `${String(4 + index * 2)} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${String(labels.length)} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (const [index, safeLabel] of labels.entries()) {
    const pageObject = 4 + index * 2;
    const streamObject = pageObject + 1;
    const commands = `BT /F1 12 Tf 30 100 Td (${safeLabel}) Tj ET\n`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 3 0 R >> >> /Contents ${String(streamObject)} 0 R >>`,
      `<< /Length ${String(Buffer.byteLength(commands, 'ascii'))} >>\nstream\n${commands}endstream`,
    );
  }
  let content = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(content, 'ascii'));
    content += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(content, 'ascii');
  content += `xref\n0 ${String(objects.length + 1)}\n`;
  content += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    content += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  content += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xrefOffset)}\n%%EOF\n`;
  return Buffer.from(content, 'ascii');
}

export function createStructuredPdf(fixture: StructuredPdfFixture): Buffer {
  const kids = fixture.pages.map((_, index) => `${String(4 + index * 2)} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${String(fixture.pages.length)} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (const [index, lines] of fixture.pages.entries()) {
    const pageObject = 4 + index * 2;
    const streamObject = pageObject + 1;
    const commands = `${lines
      .map(
        ({ text, fontSize, x = 30, y }) =>
          `BT /F1 ${String(fontSize)} Tf ${String(x)} ${String(y)} Td (${escapePdfText(text)}) Tj ET`,
      )
      .join('\n')}\n`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${String(streamObject)} 0 R >>`,
      `<< /Length ${String(Buffer.byteLength(commands, 'ascii'))} >>\nstream\n${commands}endstream`,
    );
  }

  let infoObject: number | null = null;
  if (fixture.metadata) {
    const entries = Object.entries(fixture.metadata)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(
        ([key, value]) =>
          `/${key[0]?.toUpperCase() ?? ''}${key.slice(1)} (${escapePdfText(value)})`,
      )
      .join(' ');
    infoObject = objects.length + 1;
    objects.push(`<< ${entries} >>`);
  }

  let content = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(content, 'ascii'));
    content += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(content, 'ascii');
  content += `xref\n0 ${String(objects.length + 1)}\n`;
  content += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    content += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  content += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R${infoObject ? ` /Info ${String(infoObject)} 0 R` : ''} >>\nstartxref\n${String(xrefOffset)}\n%%EOF\n`;
  return Buffer.from(content, 'ascii');
}

export async function writePdfFixture(
  directory: string,
  filename: string,
  label: string | readonly string[],
): Promise<string> {
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, filename);
  await writeFile(filePath, createMinimalPdf(label), { flag: 'wx' });
  return filePath;
}

export async function writeStructuredPdfFixture(
  directory: string,
  filename: string,
  fixture: StructuredPdfFixture,
): Promise<string> {
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, filename);
  await writeFile(filePath, createStructuredPdf(fixture), { flag: 'wx' });
  return filePath;
}
