import { readFile, stat } from 'node:fs/promises';

import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';

export type MetadataCandidateSource = 'pdf_metadata' | 'first_page' | 'none';
export type MetadataConfidence = 'high' | 'medium' | 'low' | 'unconfirmed';
export type MetadataExtractionStatus = 'complete' | 'partial' | 'failed';

export interface MetadataCandidate<T> {
  readonly value: T | null;
  readonly source: MetadataCandidateSource;
  readonly confidence: MetadataConfidence;
}

export interface ExtractedPdfPage {
  readonly pageNumber: number;
  readonly text: string;
  readonly status: 'complete' | 'failed';
}

export type MetadataExtractionIssueCode =
  | 'PDF_OPEN_FAILED'
  | 'METADATA_READ_FAILED'
  | 'PAGE_TEXT_FAILED'
  | 'NO_TEXT'
  | 'EXTRACTION_LIMIT_REACHED'
  | 'EXTRACTION_TIMEOUT'
  | 'EXTRACTION_CANCELLED'
  | 'WORKER_FAILED';

export interface MetadataExtractionIssue {
  readonly code: MetadataExtractionIssueCode;
  readonly message: string;
  readonly pageNumber: number | null;
}

export interface ExtractedPaperData {
  readonly status: MetadataExtractionStatus;
  readonly pageCount: number | null;
  readonly title: MetadataCandidate<string>;
  readonly authors: MetadataCandidate<readonly string[]>;
  readonly abstract: MetadataCandidate<string>;
  readonly doi: MetadataCandidate<string>;
  readonly pages: readonly ExtractedPdfPage[];
  readonly issues: readonly MetadataExtractionIssue[];
}

export interface StandardPdfMetadata {
  readonly title: string | null;
  readonly author: string | null;
  readonly description: string | null;
  readonly subject: string | null;
  readonly keywords: string | null;
  readonly doi: string | null;
}

export interface FirstPageTextLine {
  readonly text: string;
  readonly fontSize: number;
  readonly y: number;
}

export interface MetadataInferenceInput {
  readonly metadata: StandardPdfMetadata;
  readonly firstPageLines: readonly FirstPageTextLine[];
}

export interface InferredPaperMetadata {
  readonly title: MetadataCandidate<string>;
  readonly authors: MetadataCandidate<readonly string[]>;
  readonly abstract: MetadataCandidate<string>;
  readonly doi: MetadataCandidate<string>;
}

export interface PdfMetadataExtractionLimits {
  readonly maxInputBytes: number;
  readonly maxPages: number;
  readonly maxTextCharactersPerPage: number;
  readonly maxTotalTextCharacters: number;
}

interface PdfTextItem {
  readonly str: string;
  readonly transform: readonly unknown[];
  readonly height: number;
  readonly hasEOL: boolean;
}

const EMPTY_METADATA: StandardPdfMetadata = Object.freeze({
  title: null,
  author: null,
  description: null,
  subject: null,
  keywords: null,
  doi: null,
});

const DOI_IN_TEXT_PATTERN = /10\.\d{4,9}\/[-._;()/:a-z0-9]+/i;
const DOI_ONLY_PATTERN = /^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i;
const TITLE_EXCLUSION_PATTERN =
  /^(?:(?:abstract|authors?|keywords?|index terms?|doi)\b|\u6458\u8981|\u4f5c\u8005)|(?:doi\.org|arxiv|https?:\/\/|www\.|@)/iu;
const ABSTRACT_END_PATTERN =
  /^(?:(?:keywords?|index terms?|doi|introduction|\d+\.?\s+introduction)\b|https?:\/\/(?:dx\.)?doi\.org\/|\u5173\u952e\u8bcd)/iu;
const DOCUMENT_FILENAME_PATTERN = /(?:^|[\\/])[^\\/]+\.(?:pdf|docx?|dotx?|rtf|odt|tex|pptx?)$/iu;
const PRODUCER_TITLE_PATTERN =
  /^(?:microsoft (?:word|powerpoint)|libreoffice(?: writer)?|adobe acrobat|acrobat distiller|pdftex|latex)(?:\s*[-:]\s*.*)?$/iu;
const AUTHOR_PLACEHOLDER_PATTERN =
  /^(?:user|admin(?:istrator)?|root|owner|unknown|anonymous|microsoft office user)$/iu;

export const DEFAULT_PDF_METADATA_EXTRACTION_LIMITS: PdfMetadataExtractionLimits = Object.freeze({
  maxInputBytes: 256 * 1024 * 1024,
  maxPages: 2_000,
  maxTextCharactersPerPage: 200_000,
  maxTotalTextCharacters: 20_000_000,
});

function emptyCandidate<T>(): MetadataCandidate<T> {
  return { value: null, source: 'none', confidence: 'unconfirmed' };
}

function candidate<T>(
  value: T,
  source: Exclude<MetadataCandidateSource, 'none'>,
  confidence: Exclude<MetadataConfidence, 'unconfirmed'>,
): MetadataCandidate<T> {
  return { value, source, confidence };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function meaningfulText(value: string | null, maximum: number): string | null {
  if (!value) {
    return null;
  }
  const normalized = normalizeWhitespace(value).slice(0, maximum);
  if (
    normalized.length === 0 ||
    /^(?:untitled|unknown|none|n\/?a|microsoft word|acrobat distiller)$/iu.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function metadataTitle(value: string | null): string | null {
  const normalized = meaningfulText(value, 500);
  if (
    !normalized ||
    DOCUMENT_FILENAME_PATTERN.test(normalized) ||
    PRODUCER_TITLE_PATTERN.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function removeUnmatchedClosingParenthesis(value: string): string {
  let result = value;
  const opening = (result.match(/\(/gu) ?? []).length;
  let closing = (result.match(/\)/gu) ?? []).length;
  while (result.endsWith(')') && closing > opening) {
    result = result.slice(0, -1);
    closing -= 1;
  }
  return result;
}

export function normalizeDoi(value: string): string | null {
  const withoutPrefix = value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '')
    .replace(/^doi\s*:\s*/iu, '')
    .trim();
  const withoutPunctuation = removeUnmatchedClosingParenthesis(
    withoutPrefix.replace(/[.,;:]+$/u, ''),
  );
  if (withoutPunctuation.length > 300 || !DOI_ONLY_PATTERN.test(withoutPunctuation)) {
    return null;
  }
  return withoutPunctuation.toLowerCase();
}

function findDoi(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = DOI_IN_TEXT_PATTERN.exec(value);
  return match ? normalizeDoi(match[0]) : null;
}

function normalizeAuthors(value: string | null): readonly string[] | null {
  const normalized = meaningfulText(value, 10_000);
  if (!normalized) {
    return null;
  }
  const seen = new Set<string>();
  const authors = normalized
    .split(/\s*(?:;|\n|\band\b)\s*/iu)
    .map((author) => normalizeWhitespace(author))
    .filter(
      (author) =>
        author.length >= 2 &&
        author.length <= 300 &&
        !author.includes('@') &&
        !/^(?:unknown|anonymous|none|n\/?a)$/iu.test(author) &&
        !AUTHOR_PLACEHOLDER_PATTERN.test(author) &&
        !DOCUMENT_FILENAME_PATTERN.test(author),
    )
    .filter((author) => {
      const key = author.toLocaleLowerCase('en-US');
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 100);
  return authors.length > 0 ? authors : null;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted[middle];
  return value ?? 0;
}

function inferTitle(lines: readonly FirstPageTextLine[]): MetadataCandidate<string> {
  const usable = lines
    .slice(0, 30)
    .map((line, index) => ({ ...line, text: meaningfulText(line.text, 500), index }))
    .filter(
      (line): line is FirstPageTextLine & { readonly text: string; readonly index: number } =>
        line.text !== null &&
        line.text.length >= 8 &&
        /\p{L}/u.test(line.text) &&
        !TITLE_EXCLUSION_PATTERN.test(line.text),
    );
  if (usable.length === 0) {
    return emptyCandidate();
  }

  const baseline = median(usable.map(({ fontSize }) => fontSize).filter((size) => size > 0));
  const ranked = [...usable].sort(
    (left, right) => right.fontSize - left.fontSize || left.index - right.index,
  );
  const selected = ranked[0];
  if (!selected) {
    return emptyCandidate();
  }

  const hasTitleScale = selected.fontSize >= 16 || selected.fontSize >= baseline * 1.2;
  if (!hasTitleScale) {
    return emptyCandidate();
  }
  const confidence =
    selected.fontSize >= 16 && selected.fontSize >= baseline * 1.35 ? 'medium' : 'low';
  return candidate(selected.text, 'first_page', confidence);
}

function inferAuthors(lines: readonly FirstPageTextLine[]): MetadataCandidate<readonly string[]> {
  for (const line of lines.slice(0, 40)) {
    const match = /^\s*(?:authors?|\u4f5c\u8005)\s*[:\uFF1A]\s*(.+)$/iu.exec(line.text);
    const authors = normalizeAuthors(match?.[1] ?? null);
    if (authors) {
      return candidate(authors, 'first_page', 'medium');
    }
  }
  return emptyCandidate();
}

function inferAbstract(lines: readonly FirstPageTextLine[]): MetadataCandidate<string> {
  const normalizedLines = lines.map(({ text }) => normalizeWhitespace(text));
  const headingIndex = normalizedLines.findIndex((line) =>
    /^(?:abstract\b|\u6458\u8981)/iu.test(line),
  );
  if (headingIndex < 0) {
    return emptyCandidate();
  }

  const heading = normalizedLines[headingIndex] ?? '';
  const inlineText = heading.replace(/^(?:abstract\b|\u6458\u8981)\s*[:\uFF1A.-]?\s*/iu, '');
  const parts = inlineText.length > 0 ? [inlineText] : [];
  for (const line of normalizedLines.slice(headingIndex + 1, headingIndex + 16)) {
    if (!line || ABSTRACT_END_PATTERN.test(line)) {
      break;
    }
    parts.push(line);
    if (parts.join(' ').length >= 10_000) {
      break;
    }
  }

  const abstract = meaningfulText(parts.join(' '), 10_000);
  return abstract && abstract.length >= 20
    ? candidate(abstract, 'first_page', 'medium')
    : emptyCandidate();
}

function inferDoi(input: MetadataInferenceInput): MetadataCandidate<string> {
  const direct = input.metadata.doi ? normalizeDoi(input.metadata.doi) : null;
  if (direct) {
    return candidate(direct, 'pdf_metadata', 'high');
  }

  const metadataText = [input.metadata.subject, input.metadata.keywords]
    .filter((value): value is string => value !== null)
    .join('\n');
  const fromMetadataText = findDoi(metadataText);
  if (fromMetadataText) {
    return candidate(fromMetadataText, 'pdf_metadata', 'medium');
  }

  const firstPageText = input.firstPageLines.map(({ text }) => text).join('\n');
  const fromFirstPage = findDoi(firstPageText);
  if (!fromFirstPage) {
    return emptyCandidate();
  }
  const explicitlyLabelled = /(?:\bdoi\s*:|doi\.org\/)\s*10\./iu.test(firstPageText);
  return candidate(fromFirstPage, 'first_page', explicitlyLabelled ? 'medium' : 'low');
}

export function inferPaperMetadata(input: MetadataInferenceInput): InferredPaperMetadata {
  const metadataTitleValue = metadataTitle(input.metadata.title);
  const metadataAuthors = normalizeAuthors(input.metadata.author);
  const metadataAbstract = meaningfulText(input.metadata.description, 10_000);

  return {
    title: metadataTitleValue
      ? candidate(metadataTitleValue, 'pdf_metadata', 'medium')
      : inferTitle(input.firstPageLines),
    authors: metadataAuthors
      ? candidate(metadataAuthors, 'pdf_metadata', 'medium')
      : inferAuthors(input.firstPageLines),
    abstract: metadataAbstract
      ? candidate(metadataAbstract, 'pdf_metadata', 'medium')
      : inferAbstract(input.firstPageLines),
    doi: inferDoi(input),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function valueAsString(value: unknown): string | null {
  if (typeof value === 'string') {
    return meaningfulText(value, 100_000);
  }
  if (Array.isArray(value)) {
    const values = value
      .map((item) => (typeof item === 'string' ? meaningfulText(item, 10_000) : null))
      .filter((item): item is string => item !== null);
    return values.length > 0 ? values.join('; ') : null;
  }
  return null;
}

function recordValue(
  record: Readonly<Record<string, unknown>>,
  names: readonly string[],
): string | null {
  const wanted = new Set(names.map((name) => name.toLocaleLowerCase('en-US')));
  for (const [key, value] of Object.entries(record)) {
    if (wanted.has(key.toLocaleLowerCase('en-US'))) {
      const text = valueAsString(value);
      if (text) {
        return text;
      }
    }
  }
  return null;
}

function xmpValue(metadata: unknown, names: readonly string[]): string | null {
  if (!isRecord(metadata) || typeof metadata.get !== 'function') {
    return null;
  }
  const get = metadata.get as (name: string) => unknown;
  for (const name of names) {
    try {
      const value = valueAsString(get.call(metadata, name));
      if (value) {
        return value;
      }
    } catch {
      // A malformed individual XMP field must not discard other usable metadata.
    }
  }
  return null;
}

async function readStandardMetadata(document: PDFDocumentProxy): Promise<StandardPdfMetadata> {
  const result = await document.getMetadata();
  const info = isRecord(result.info) ? result.info : {};
  return {
    title: recordValue(info, ['Title']) ?? xmpValue(result.metadata, ['dc:title']),
    author: recordValue(info, ['Author']) ?? xmpValue(result.metadata, ['dc:creator']),
    description: xmpValue(result.metadata, ['dc:description']),
    subject: recordValue(info, ['Subject']) ?? xmpValue(result.metadata, ['dc:subject']),
    keywords: recordValue(info, ['Keywords']) ?? xmpValue(result.metadata, ['pdf:keywords']),
    doi: recordValue(info, ['DOI']) ?? xmpValue(result.metadata, ['prism:doi', 'dc:identifier']),
  };
}

function isPdfTextItem(value: unknown): value is PdfTextItem {
  return (
    isRecord(value) &&
    typeof value.str === 'string' &&
    Array.isArray(value.transform) &&
    typeof value.height === 'number' &&
    typeof value.hasEOL === 'boolean'
  );
}

function coordinate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function appendText(existing: string, next: string): string {
  if (!existing) {
    return next;
  }
  const needsSpace = /[a-z0-9]$/iu.test(existing) && /^[a-z0-9]/iu.test(next);
  return `${existing}${needsSpace ? ' ' : ''}${next}`;
}

export function textItemsToLines(items: readonly unknown[]): readonly FirstPageTextLine[] {
  const lines: FirstPageTextLine[] = [];
  let current: { text: string; fontSize: number; y: number } | null = null;

  const flush = (): void => {
    if (current) {
      const text = normalizeWhitespace(current.text);
      if (text) {
        lines.push({ text, fontSize: current.fontSize, y: current.y });
      }
      current = null;
    }
  };

  for (const rawItem of items) {
    if (!isPdfTextItem(rawItem)) {
      continue;
    }
    const text = normalizeWhitespace(rawItem.str);
    const y = coordinate(rawItem.transform[5]);
    const transformFontSize = Math.hypot(
      coordinate(rawItem.transform[2]),
      coordinate(rawItem.transform[3]),
    );
    const fontSize = Math.max(rawItem.height, transformFontSize, 0);
    const yTolerance = Math.max(2, fontSize * 0.35);

    if (current && Math.abs(current.y - y) > yTolerance) {
      flush();
    }
    if (text) {
      current ??= { text: '', fontSize, y };
      current.text = appendText(current.text, text);
      current.fontSize = Math.max(current.fontSize, fontSize);
    }
    if (rawItem.hasEOL) {
      flush();
    }
  }
  flush();
  return lines;
}

export function createFailedExtractionResult(issue: MetadataExtractionIssue): ExtractedPaperData {
  const inferred = inferPaperMetadata({ metadata: EMPTY_METADATA, firstPageLines: [] });
  return {
    status: 'failed',
    pageCount: null,
    ...inferred,
    pages: [],
    issues: [issue],
  };
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function resolveLimits(
  limits: Partial<PdfMetadataExtractionLimits> | undefined,
): PdfMetadataExtractionLimits {
  return {
    maxInputBytes: positiveLimit(
      limits?.maxInputBytes,
      DEFAULT_PDF_METADATA_EXTRACTION_LIMITS.maxInputBytes,
    ),
    maxPages: positiveLimit(limits?.maxPages, DEFAULT_PDF_METADATA_EXTRACTION_LIMITS.maxPages),
    maxTextCharactersPerPage: positiveLimit(
      limits?.maxTextCharactersPerPage,
      DEFAULT_PDF_METADATA_EXTRACTION_LIMITS.maxTextCharactersPerPage,
    ),
    maxTotalTextCharacters: positiveLimit(
      limits?.maxTotalTextCharacters,
      DEFAULT_PDF_METADATA_EXTRACTION_LIMITS.maxTotalTextCharacters,
    ),
  };
}

function boundedPageText(
  lines: readonly FirstPageTextLine[],
  maximum: number,
): { readonly text: string; readonly truncated: boolean } {
  const parts: string[] = [];
  let length = 0;
  for (const { text } of lines) {
    const separatorLength = parts.length > 0 ? 1 : 0;
    const available = maximum - length - separatorLength;
    if (available <= 0) {
      return { text: parts.join('\n'), truncated: true };
    }
    parts.push(text.slice(0, available));
    length += separatorLength + Math.min(text.length, available);
    if (text.length > available) {
      return { text: parts.join('\n'), truncated: true };
    }
  }
  return { text: parts.join('\n'), truncated: false };
}

async function destroyPdf(loadingTask: PDFDocumentLoadingTask | null): Promise<void> {
  try {
    if (loadingTask) {
      await loadingTask.destroy();
    }
  } catch {
    // Cleanup failures do not change already extracted metadata.
  }
}

export class PdfMetadataExtractor {
  private readonly limits: PdfMetadataExtractionLimits;

  public constructor(limits?: Partial<PdfMetadataExtractionLimits>) {
    this.limits = resolveLimits(limits);
  }

  public async extract(filePath: string): Promise<ExtractedPaperData> {
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let document: PDFDocumentProxy;

    try {
      const fileStats = await stat(filePath);
      if (!fileStats.isFile()) throw new Error('The extraction input is not a regular file.');
      if (fileStats.size > this.limits.maxInputBytes) {
        return createFailedExtractionResult({
          code: 'EXTRACTION_LIMIT_REACHED',
          message:
            'Local metadata and text extraction was skipped because the PDF exceeds the configured input-size limit.',
          pageNumber: null,
        });
      }
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const file = await readFile(filePath);
      const data = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
      loadingTask = pdfjs.getDocument({
        data,
        stopAtErrors: false,
        useWorkerFetch: false,
      });
      document = await loadingTask.promise;
    } catch {
      await destroyPdf(loadingTask);
      return createFailedExtractionResult({
        code: 'PDF_OPEN_FAILED',
        message: 'The PDF could not be opened for local metadata extraction.',
        pageNumber: null,
      });
    }

    const issues: MetadataExtractionIssue[] = [];
    const pages: ExtractedPdfPage[] = [];
    let metadata = EMPTY_METADATA;
    let firstPageLines: readonly FirstPageTextLine[] = [];

    try {
      try {
        metadata = await readStandardMetadata(document);
      } catch {
        issues.push({
          code: 'METADATA_READ_FAILED',
          message: 'The PDF metadata dictionary could not be read.',
          pageNumber: null,
        });
      }

      const pageLimit = Math.min(document.numPages, this.limits.maxPages);
      if (document.numPages > pageLimit) {
        issues.push({
          code: 'EXTRACTION_LIMIT_REACHED',
          message: `Text extraction was limited to the first ${String(pageLimit)} pages.`,
          pageNumber: null,
        });
      }
      let totalTextCharacters = 0;
      for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
        const remainingCharacters = this.limits.maxTotalTextCharacters - totalTextCharacters;
        if (remainingCharacters <= 0) {
          issues.push({
            code: 'EXTRACTION_LIMIT_REACHED',
            message: 'Text extraction stopped at the document character limit.',
            pageNumber: null,
          });
          break;
        }
        try {
          const page = await document.getPage(pageNumber);
          try {
            const content = await page.getTextContent();
            const lines = textItemsToLines(content.items);
            if (pageNumber === 1) {
              firstPageLines = lines.slice(0, 100);
            }
            const bounded = boundedPageText(
              lines,
              Math.min(this.limits.maxTextCharactersPerPage, remainingCharacters),
            );
            pages.push({
              pageNumber,
              text: bounded.text,
              status: 'complete',
            });
            totalTextCharacters += bounded.text.length;
            if (bounded.truncated) {
              issues.push({
                code: 'EXTRACTION_LIMIT_REACHED',
                message: 'Text extraction reached the configured character limit.',
                pageNumber,
              });
            }
          } finally {
            page.cleanup();
          }
        } catch {
          pages.push({ pageNumber, text: '', status: 'failed' });
          issues.push({
            code: 'PAGE_TEXT_FAILED',
            message: 'Text could not be extracted from this PDF page.',
            pageNumber,
          });
        }
      }

      if (!pages.some(({ text }) => text.length > 0)) {
        issues.push({
          code: 'NO_TEXT',
          message: 'No searchable text was found in the PDF.',
          pageNumber: null,
        });
      }

      const inferred = inferPaperMetadata({ metadata, firstPageLines });
      return {
        status: issues.length > 0 ? 'partial' : 'complete',
        pageCount: document.numPages,
        ...inferred,
        pages,
        issues,
      };
    } finally {
      await destroyPdf(loadingTask);
    }
  }
}
