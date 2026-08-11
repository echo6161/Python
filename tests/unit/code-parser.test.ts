// @vitest-environment node

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  languageForCodePath,
  parseCodeFile,
  type CodeParserInput,
} from '../../src/main/code-intelligence/code-parser';

describe('Code Intelligence parser', () => {
  it('extracts Python classes, functions, methods, and imports with stable lines', () => {
    const parsed = parse('analysis.py', 'python', [
      'import os',
      '',
      'class Analyzer:',
      '    def run(self):',
      '        return os.getcwd()',
      '',
      'def load_data():',
      '    return []',
    ]);

    expect(parsed.parseMode).toBe('structured');
    expect(parsed.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'import', startLine: 1 }),
        expect.objectContaining({ kind: 'class', name: 'Analyzer', startLine: 3, endLine: 5 }),
        expect.objectContaining({
          kind: 'method',
          name: 'run',
          qualifiedName: 'Analyzer.run',
          startLine: 4,
        }),
        expect.objectContaining({ kind: 'function', name: 'load_data', startLine: 7, endLine: 8 }),
      ]),
    );
    expect(parsed.chunks.some(({ startLine, endLine }) => startLine === 3 && endLine === 5)).toBe(
      true,
    );
  });

  it('extracts JavaScript and TypeScript structures without claiming other languages', () => {
    const javascript = parse('index.js', 'javascript', [
      "import { readFile } from 'node:fs';",
      'export class Reader {',
      '  open() { return readFile; }',
      '}',
      'export const makeReader = () => new Reader();',
    ]);
    const typescript = parse('types.ts', 'typescript', [
      'export interface Paper { title: string }',
      'export type PaperId = string;',
      'export function titleOf(paper: Paper): string {',
      '  return paper.title;',
      '}',
    ]);

    expect(javascript.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'class', name: 'Reader', startLine: 2 }),
        expect.objectContaining({ kind: 'method', name: 'open', startLine: 3 }),
        expect.objectContaining({ kind: 'function', name: 'makeReader', startLine: 5 }),
      ]),
    );
    expect(typescript.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'interface', name: 'Paper', startLine: 1 }),
        expect.objectContaining({ kind: 'type', name: 'PaperId', startLine: 2 }),
        expect.objectContaining({ kind: 'function', name: 'titleOf', startLine: 3, endLine: 5 }),
      ]),
    );
    expect(languageForCodePath('main.py')).toBe('python');
    expect(languageForCodePath('main.ts')).toBe('typescript');
    expect(languageForCodePath('main.go')).toBe('unsupported');
    expect(languageForCodePath('notes.md')).toBeNull();
  });

  it('falls back to bounded line chunks for syntax errors and unsupported files', () => {
    const broken = parse('broken.py', 'python', ['def broken(:', '  pass']);
    const unsupported = parse('main.go', 'unsupported', ['package main', 'func main() {}']);

    expect(broken).toMatchObject({ parseMode: 'fallback', lineCount: 2 });
    expect(broken.symbols).toHaveLength(1);
    expect(unsupported).toMatchObject({ parseMode: 'fallback', lineCount: 2 });
    expect(unsupported.symbols.map(({ kind }) => kind)).toEqual(['module']);
    expect(unsupported.chunks[0]).toMatchObject({ startLine: 1, endLine: 2 });
  });

  it('keeps semantic chunks within the bounded line limit', () => {
    const parsed = parse('long.py', 'python', [
      'def long_function():',
      ...Array.from({ length: 170 }, (_, index) => `    value_${String(index)} = ${String(index)}`),
    ]);

    expect(parsed.parseMode).toBe('structured');
    expect(parsed.chunks).toHaveLength(3);
    expect(parsed.chunks.every(({ startLine, endLine }) => endLine - startLine + 1 <= 80)).toBe(
      true,
    );
    expect(parsed.chunks.every(({ symbolIndex }) => symbolIndex === 1)).toBe(true);
  });
});

function parse(relativePath: string, language: CodeParserInput['language'], lines: string[]) {
  const content = lines.join('\n');
  return parseCodeFile({
    relativePath,
    language,
    content,
    contentHash: createHash('sha256').update(content).digest('hex'),
    byteSize: Buffer.byteLength(content),
  });
}
