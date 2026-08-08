import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
