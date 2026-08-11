import { createHash } from 'node:crypto';

import type { SyntaxNode, Tree } from '@lezer/common';
import { parser as javascriptParser } from '@lezer/javascript';
import { parser as pythonParser } from '@lezer/python';

import type {
  CodeLanguage,
  CodeParseMode,
  CodeSymbolKind,
} from '../../shared/contracts/code-intelligence';

export const CODE_PARSER_VERSION =
  'lezer-python@1.1.19+lezer-javascript@1.5.4+papermind-extractor@1';
const MAX_CHUNK_LINES = 80;

export interface CodeParserInput {
  readonly relativePath: string;
  readonly language: CodeLanguage;
  readonly content: string;
  readonly contentHash: string;
  readonly byteSize: number;
}

export interface ParsedCodeSymbol {
  readonly kind: CodeSymbolKind;
  readonly name: string;
  readonly qualifiedName: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly contentHash: string;
}

export interface ParsedCodeChunk {
  readonly symbolIndex: number | null;
  readonly startLine: number;
  readonly endLine: number;
  readonly contentHash: string;
  readonly content: string;
}

export interface ParsedCodeFile extends CodeParserInput {
  readonly parseMode: CodeParseMode;
  readonly lineCount: number;
  readonly symbols: readonly ParsedCodeSymbol[];
  readonly chunks: readonly ParsedCodeChunk[];
}

interface SymbolCandidate extends ParsedCodeSymbol {
  readonly from: number;
  readonly to: number;
  readonly semanticDepth: number | null;
}

export function languageForCodePath(relativePath: string): CodeLanguage | null {
  const lower = relativePath.toLocaleLowerCase();
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return 'javascript';
  }
  if (lower.endsWith('.go') || lower.endsWith('.java') || lower.endsWith('.rs')) {
    return 'unsupported';
  }
  return null;
}

export function parseCodeFile(input: CodeParserInput): ParsedCodeFile {
  const lines = splitLines(input.content);
  const moduleSymbol: ParsedCodeSymbol = {
    kind: 'module',
    name: input.relativePath,
    qualifiedName: input.relativePath,
    startLine: 1,
    endLine: Math.max(lines.length, 1),
    contentHash: input.contentHash,
  };
  if (input.language === 'unsupported') {
    return fallbackFile(input, lines, moduleSymbol);
  }
  const tree = parserFor(input.language).parse(input.content);
  if (hasParseError(tree)) return fallbackFile(input, lines, moduleSymbol);
  const positions = lineStarts(input.content);
  const candidates: SymbolCandidate[] = [];
  collectSymbols(tree.topNode, input.content, positions, candidates, [], 0);
  const symbols: ParsedCodeSymbol[] = [moduleSymbol, ...candidates.map(toParsedSymbol)];
  const semantic = candidates
    .map((candidate, index) => ({ candidate, symbolIndex: index + 1 }))
    .filter(({ candidate }) => candidate.semanticDepth === 0)
    .sort((left, right) => left.candidate.from - right.candidate.from);
  return {
    ...input,
    parseMode: 'structured',
    lineCount: lines.length,
    symbols,
    chunks: semanticChunks(lines, semantic),
  };
}

function parserFor(language: Exclude<CodeLanguage, 'unsupported'>) {
  if (language === 'python') return pythonParser;
  return language === 'typescript'
    ? javascriptParser.configure({ dialect: 'ts' })
    : javascriptParser;
}

function fallbackFile(
  input: CodeParserInput,
  lines: readonly string[],
  moduleSymbol: ParsedCodeSymbol,
): ParsedCodeFile {
  return {
    ...input,
    parseMode: 'fallback',
    lineCount: lines.length,
    symbols: [moduleSymbol],
    chunks: lineChunks(lines, 1, Math.max(lines.length, 1), null),
  };
}

function hasParseError(tree: Tree): boolean {
  const cursor = tree.cursor();
  for (;;) {
    if (cursor.type.isError) return true;
    if (cursor.firstChild()) continue;
    while (!cursor.nextSibling()) {
      if (!cursor.parent()) return false;
    }
  }
}

function collectSymbols(
  node: SyntaxNode,
  source: string,
  positions: readonly number[],
  output: SymbolCandidate[],
  scope: readonly string[],
  semanticDepth: number,
): void {
  const descriptor = describeNode(node, source, scope);
  let childScope = scope;
  let childSemanticDepth = semanticDepth;
  if (descriptor) {
    const startLine = lineAt(positions, node.from);
    const endLine = lineAt(positions, Math.max(node.from, node.to - 1));
    const semantic = isSemanticKind(descriptor.kind);
    output.push({
      ...descriptor,
      startLine,
      endLine,
      contentHash: hash(source.slice(node.from, node.to)),
      from: node.from,
      to: node.to,
      semanticDepth: semantic ? semanticDepth : null,
    });
    if (
      descriptor.kind === 'class' ||
      descriptor.kind === 'function' ||
      descriptor.kind === 'method'
    ) {
      childScope = [...scope, descriptor.name];
    }
    if (semantic) childSemanticDepth += 1;
  }
  for (let child = node.firstChild; child; child = child.nextSibling) {
    collectSymbols(child, source, positions, output, childScope, childSemanticDepth);
  }
}

function describeNode(
  node: SyntaxNode,
  source: string,
  scope: readonly string[],
): Pick<ParsedCodeSymbol, 'kind' | 'name' | 'qualifiedName'> | null {
  const kind = kindForNode(node, source);
  if (!kind) return null;
  const name = symbolName(node, source, kind);
  if (!name) return null;
  return {
    kind,
    name,
    qualifiedName:
      scope.length > 0 && !['import', 'export'].includes(kind)
        ? `${scope.join('.')}.${name}`
        : name,
  };
}

function kindForNode(node: SyntaxNode, source: string): CodeSymbolKind | null {
  if (node.name === 'ClassDefinition' || node.name === 'ClassDeclaration') return 'class';
  if (node.name === 'FunctionDefinition' || node.name === 'FunctionDeclaration') {
    return nearestClass(node) ? 'method' : 'function';
  }
  if (node.name === 'MethodDeclaration') return 'method';
  if (node.name === 'InterfaceDeclaration') return 'interface';
  if (node.name === 'TypeAliasDeclaration') return 'type';
  if (
    node.name === 'ImportStatement' ||
    node.name === 'ImportFromStatement' ||
    node.name === 'ImportDeclaration'
  ) {
    return 'import';
  }
  if (node.name === 'ExportDeclaration') return 'export';
  if (node.name === 'VariableDeclaration' && node.getChild('ArrowFunction')) return 'function';
  if (node.name === 'VariableDeclaration' && source.slice(node.from, node.to).includes('=>'))
    return 'function';
  return null;
}

function symbolName(node: SyntaxNode, source: string, kind: CodeSymbolKind): string {
  if (kind === 'import' || kind === 'export') {
    return source.slice(node.from, node.to).split(/\r?\n/u)[0]?.trim().slice(0, 500) ?? kind;
  }
  const child =
    node.getChild('VariableName') ??
    node.getChild('VariableDefinition') ??
    node.getChild('TypeDefinition') ??
    node.getChild('PropertyDefinition');
  return child ? source.slice(child.from, child.to).trim().slice(0, 500) : '';
}

function nearestClass(node: SyntaxNode): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.name === 'ClassDefinition' || parent.name === 'ClassDeclaration') return true;
    if (parent.name === 'FunctionDefinition' || parent.name === 'FunctionDeclaration') return false;
  }
  return false;
}

function isSemanticKind(kind: CodeSymbolKind): boolean {
  return ['class', 'function', 'interface', 'method', 'type'].includes(kind);
}

function semanticChunks(
  lines: readonly string[],
  semantic: readonly { readonly candidate: SymbolCandidate; readonly symbolIndex: number }[],
): readonly ParsedCodeChunk[] {
  if (semantic.length === 0) return lineChunks(lines, 1, Math.max(lines.length, 1), null);
  const chunks: ParsedCodeChunk[] = [];
  let nextLine = 1;
  for (const { candidate, symbolIndex } of semantic) {
    if (candidate.startLine > nextLine) {
      chunks.push(...lineChunks(lines, nextLine, candidate.startLine - 1, null));
    }
    chunks.push(...lineChunks(lines, candidate.startLine, candidate.endLine, symbolIndex));
    nextLine = Math.max(nextLine, candidate.endLine + 1);
  }
  if (nextLine <= lines.length) chunks.push(...lineChunks(lines, nextLine, lines.length, null));
  return chunks;
}

function lineChunks(
  lines: readonly string[],
  startLine: number,
  endLine: number,
  symbolIndex: number | null,
): readonly ParsedCodeChunk[] {
  const chunks: ParsedCodeChunk[] = [];
  for (let start = startLine; start <= endLine; start += MAX_CHUNK_LINES) {
    chunks.push(chunk(lines, start, Math.min(endLine, start + MAX_CHUNK_LINES - 1), symbolIndex));
  }
  return chunks;
}

function chunk(
  lines: readonly string[],
  startLine: number,
  endLine: number,
  symbolIndex: number | null,
): ParsedCodeChunk {
  const content = lines
    .slice(startLine - 1, endLine)
    .join('\n')
    .slice(0, 65_536);
  return { symbolIndex, startLine, endLine, contentHash: hash(content), content };
}

function splitLines(content: string): readonly string[] {
  return content.length === 0 ? [''] : content.split(/\r?\n/u);
}

function lineStarts(content: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

function toParsedSymbol(candidate: SymbolCandidate): ParsedCodeSymbol {
  return {
    kind: candidate.kind,
    name: candidate.name,
    qualifiedName: candidate.qualifiedName,
    startLine: candidate.startLine,
    endLine: candidate.endLine,
    contentHash: candidate.contentHash,
  };
}

function lineAt(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if ((starts[middle] ?? 0) <= offset) low = middle;
    else high = middle;
  }
  return low + 1;
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
