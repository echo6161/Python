import type { ReactNode } from 'react';

const KEYWORDS = new Set([
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'def',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'interface',
  'let',
  'match',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'raise',
  'return',
  'static',
  'struct',
  'switch',
  'throw',
  'true',
  'try',
  'type',
  'undefined',
  'var',
  'while',
  'with',
  'yield',
]);

const TOKEN_PATTERN =
  /(\/\/.*$|#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/gu;

export function highlightSourceLine(line: string, language: string): ReactNode {
  if (language === 'text') return line || ' ';
  const output: ReactNode[] = [];
  let cursor = 0;
  for (const match of line.matchAll(TOKEN_PATTERN)) {
    const index = match.index;
    const token = match[0];
    if (index > cursor) output.push(line.slice(cursor, index));
    output.push(
      <span className={tokenClass(token)} key={`${String(index)}:${token}`}>
        {token}
      </span>,
    );
    cursor = index + token.length;
  }
  if (cursor < line.length) output.push(line.slice(cursor));
  return output.length > 0 ? output : ' ';
}

function tokenClass(token: string): string {
  if (token.startsWith('//') || token.startsWith('#')) return 'text-emerald-700';
  if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
    return 'text-amber-700';
  }
  if (/^\d/u.test(token)) return 'text-sky-700';
  if (KEYWORDS.has(token)) return 'font-semibold text-fuchsia-700';
  return 'text-zinc-900';
}
