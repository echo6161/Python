import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
  TextLayer: vi.fn(),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'pdf.worker.mjs' }));

import { App } from '../../src/renderer/App';
import type { PaperDetails } from '../../src/shared/contracts/library';

const importDroppedPdfsMock = vi.fn().mockResolvedValue({
  ok: true,
  value: { cancelled: false, items: [] },
});
const listPapersMock = vi.fn();
const getPaperMock = vi.fn();
const batchUpdatePapersMock = vi.fn();
const listOrganizationMock = vi.fn();
const deleteTagMock = vi.fn();

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (!resolvePromise) throw new Error('Deferred promise was not initialized.');
      resolvePromise(value);
    },
  };
}

const paperDetails: PaperDetails = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Confirmable paper',
  abstract: null,
  year: null,
  doi: null,
  venue: null,
  language: null,
  authors: [],
  tags: [],
  collections: [],
  status: 'ready',
  readingStatus: 'unread',
  isFavorite: false,
  metadataReviewStatus: 'pending',
  metadataEvidence: [
    { field: 'title', source: 'filename', confidence: 'unconfirmed', userEdited: false },
    { field: 'authors', source: 'none', confidence: 'unconfirmed', userEdited: false },
    { field: 'abstract', source: 'none', confidence: 'unconfirmed', userEdited: false },
    { field: 'year', source: 'none', confidence: 'unconfirmed', userEdited: false },
    { field: 'doi', source: 'none', confidence: 'unconfirmed', userEdited: false },
  ],
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
  rowVersion: 1,
  file: {
    id: '550e8400-e29b-41d4-a716-446655440001',
    originalFilename: 'confirmable.pdf',
    internalFilename: `${'b'.repeat(64)}.pdf`,
    byteSize: 512,
    sha256: 'b'.repeat(64),
    mimeType: 'application/pdf',
    pageCount: 1,
    textExtractionStatus: 'succeeded',
    importedAt: '2026-08-08T00:00:00.000Z',
  },
};

describe('App', () => {
  beforeEach(() => {
    importDroppedPdfsMock.mockReset().mockResolvedValue({
      ok: true,
      value: { cancelled: false, items: [] },
    });
    listPapersMock.mockReset().mockResolvedValue({
      ok: true,
      value: { items: [], total: 0 },
    });
    getPaperMock.mockReset();
    batchUpdatePapersMock.mockReset();
    listOrganizationMock.mockReset().mockResolvedValue({
      ok: true,
      value: { tags: [], collections: [] },
    });
    deleteTagMock.mockReset();
    Object.defineProperty(window, 'paperMind', {
      configurable: true,
      value: {
        app: {
          getInfo: vi.fn().mockResolvedValue({
            name: 'PaperMind',
            version: '0.1.0-test',
            platform: 'win32',
          }),
        },
        library: {
          chooseAndImportPdfs: vi.fn().mockResolvedValue({
            ok: true,
            value: { cancelled: true, items: [] },
          }),
          importDroppedPdfs: importDroppedPdfsMock,
          listPapers: listPapersMock,
          getPaper: getPaperMock,
          updatePaperDetails: vi.fn(),
          updatePaperMetadata: vi.fn(),
          updatePaperOrganization: vi.fn(),
          batchUpdatePapers: batchUpdatePapersMock,
          listOrganization: listOrganizationMock,
          createTag: vi.fn(),
          deleteTag: deleteTagMock,
          createCollection: vi.fn(),
          deleteCollection: vi.fn(),
          removePaper: vi.fn(),
        },
        reader: {
          getPdfAccess: vi.fn(),
          getReadingState: vi.fn().mockResolvedValue({ ok: true, value: null }),
          saveReadingState: vi.fn(),
          listAnnotations: vi.fn().mockResolvedValue({ ok: true, value: [] }),
          createAnnotation: vi.fn(),
          updateAnnotation: vi.fn(),
          deleteAnnotation: vi.fn(),
          exportAnnotations: vi.fn(),
        },
        ai: {
          getCapabilities: vi.fn().mockResolvedValue({
            ok: true,
            value: {
              providerId: 'openai',
              settings: {
                baseUrl: 'https://api.openai.com/v1',
                model: 'gpt-5.6',
                temperature: 0.2,
                maxOutputTokens: 2048,
                saveHistoryByDefault: true,
              },
              credential: { configured: false, persistence: 'secure', backend: 'dpapi' },
              selectionOnlyByDefault: true,
            },
          }),
          updateSettings: vi.fn(),
          setApiKey: vi.fn(),
          deleteApiKey: vi.fn(),
          getConversation: vi.fn().mockResolvedValue({ ok: true, value: null }),
          openChatGptBridge: vi.fn(),
          startTask: vi.fn(),
          cancelTask: vi.fn(),
          onStreamEvent: vi.fn().mockReturnValue(() => undefined),
        },
        zotero: {
          detectZotero: vi.fn().mockResolvedValue({
            ok: true,
            value: {
              available: false,
              apiVersion: null,
              serverIdentity: null,
              error: { code: 'not_running', message: 'Zotero is not running.' },
            },
          }),
          listItems: vi.fn(),
          searchItems: vi.fn(),
          cancelRequest: vi.fn(),
          getItem: vi.fn(),
          listCollections: vi.fn(),
          listCollectionItems: vi.fn(),
          listAttachments: vi.fn(),
          findPrimaryPdf: vi.fn(),
          resolvePdfAvailability: vi.fn(),
        },
        workspace: {
          create: vi.fn(),
          get: vi.fn(),
          list: vi.fn().mockResolvedValue({ ok: true, value: [] }),
          update: vi.fn(),
          setStatus: vi.fn(),
          delete: vi.fn(),
          getLastActive: vi.fn().mockResolvedValue({ ok: true, value: null }),
          setLastActive: vi.fn(),
          addPaper: vi.fn(),
          removePaper: vi.fn(),
          listPapers: vi.fn(),
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders Workspace as the root and keeps the secure legacy library available', async () => {
    render(<App />);

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Workspace' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      await screen.findByRole('heading', { name: 'Create a research Workspace' }),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Legacy Library' }));
    expect(screen.getByRole('heading', { name: 'All papers' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'PDF reader' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Annotations' })).toBeDefined();
    expect(await screen.findByText('Library is empty')).toBeDefined();
    expect(await screen.findByText('v0.1.0-test')).toBeDefined();
  });

  it('passes dropped PDF files through the preload library API', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Legacy Library' }));
    const file = new File(['%PDF-test'], 'dropped.pdf', { type: 'application/pdf' });

    fireEvent.drop(screen.getByTestId('library-drop-zone'), {
      dataTransfer: { files: [file] },
    });

    expect(importDroppedPdfsMock).toHaveBeenCalledWith([file]);
  });

  it('requires an explicit choice between record-only and managed-file removal', async () => {
    listPapersMock.mockResolvedValue({
      ok: true,
      value: { items: [paperDetails], total: 1 },
    });
    getPaperMock.mockResolvedValue({ ok: true, value: paperDetails });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Legacy Library' }));

    await screen.findByText('Confirmable paper', { selector: 'h2' });
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    await screen.findByDisplayValue('Confirmable paper');
    fireEvent.click(screen.getByRole('button', { name: 'Remove paper' }));

    expect(screen.getByRole('dialog', { name: 'Remove paper?' })).toBeDefined();
    expect(screen.getByRole('button', { name: /Remove record only/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Remove record and managed copy/ })).toBeDefined();
  });

  it('opens the settings placeholder from the sidebar', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'OpenAI provider' })).toBeDefined();
    await waitFor(() =>
      expect(screen.getByTestId('api-key-status').textContent).toBe('Not configured'),
    );
  });

  it('opens the Zotero integration without changing the legacy library', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Zotero Browser' }));

    expect(screen.getByRole('heading', { name: 'Zotero Integration' })).toBeDefined();
    expect(await screen.findByText('Status: Not Running')).toBeDefined();
  });

  it('keeps an imported paper selected when a stale filtered list refresh finishes', async () => {
    importDroppedPdfsMock.mockResolvedValue({
      ok: true,
      value: {
        cancelled: false,
        items: [
          {
            originalFilename: paperDetails.file.originalFilename,
            status: 'imported',
            paper: paperDetails,
            warning: null,
            error: null,
          },
        ],
      },
    });
    getPaperMock.mockResolvedValue({ ok: true, value: paperDetails });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Legacy Library' }));

    const file = new File(['%PDF-test'], 'confirmable.pdf', { type: 'application/pdf' });
    fireEvent.drop(screen.getByTestId('library-drop-zone'), {
      dataTransfer: { files: [file] },
    });

    expect(await screen.findByDisplayValue('Confirmable paper')).toBeDefined();
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    });
    expect(screen.getByDisplayValue('Confirmable paper')).toBeDefined();
  });

  it('retries a transient failure while polling pending text extraction', async () => {
    vi.useFakeTimers();
    const pendingPaper: PaperDetails = {
      ...paperDetails,
      file: { ...paperDetails.file, textExtractionStatus: 'pending' },
    };
    const indexedPaper: PaperDetails = {
      ...pendingPaper,
      file: { ...pendingPaper.file, textExtractionStatus: 'succeeded' },
    };
    listPapersMock
      .mockResolvedValueOnce({ ok: true, value: { items: [pendingPaper], total: 1 } })
      .mockRejectedValueOnce(new Error('Transient list failure'))
      .mockResolvedValue({ ok: true, value: { items: [indexedPaper], total: 1 } });
    const indexLookup = createDeferred<{ ok: true; value: PaperDetails }>();
    getPaperMock
      .mockResolvedValueOnce({ ok: true, value: pendingPaper })
      .mockReturnValue(indexLookup.promise);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Legacy Library' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('pending')).toBeDefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByText('pending')).toBeDefined();
    await act(async () => {
      indexLookup.resolve({ ok: true, value: indexedPaper });
      await indexLookup.promise;
    });
    expect(screen.getByText('succeeded')).toBeDefined();
  });

  it('resets discarded detail edits before applying a batch change to another paper', async () => {
    const otherPaper: PaperDetails = {
      ...paperDetails,
      id: '550e8400-e29b-41d4-a716-446655440020',
      title: 'Other paper',
      file: {
        ...paperDetails.file,
        id: '550e8400-e29b-41d4-a716-446655440021',
        originalFilename: 'other.pdf',
        sha256: 'c'.repeat(64),
        internalFilename: `${'c'.repeat(64)}.pdf`,
      },
    };
    listPapersMock.mockResolvedValue({
      ok: true,
      value: { items: [paperDetails, otherPaper], total: 2 },
    });
    getPaperMock.mockImplementation((id: string) =>
      Promise.resolve({ ok: true, value: id === otherPaper.id ? otherPaper : paperDetails }),
    );
    batchUpdatePapersMock.mockResolvedValue({
      ok: true,
      value: { updatedIds: [otherPaper.id] },
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Legacy Library' }));

    await screen.findByText('Confirmable paper', { selector: 'h2' });
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    const title = await screen.findByDisplayValue<HTMLInputElement>('Confirmable paper');
    fireEvent.change(title, { target: { value: 'Unsaved title' } });
    fireEvent.click(screen.getByLabelText('Select Other paper'));
    fireEvent.change(screen.getByLabelText('Set reading status'), {
      target: { value: 'completed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(batchUpdatePapersMock).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledWith('Discard unsaved paper detail changes?');
    expect(screen.getByDisplayValue('Confirmable paper')).toBeDefined();
    expect(screen.queryByDisplayValue('Unsaved title')).toBeNull();
    confirm.mockRestore();
  });

  it('keeps refreshed details visible when a post-delete list refresh fails', async () => {
    const managedTag = {
      id: '550e8400-e29b-41d4-a716-446655440040',
      name: 'Managed tag',
      color: null,
    } as const;
    const organizedPaper: PaperDetails = { ...paperDetails, tags: [managedTag], rowVersion: 2 };
    listPapersMock
      .mockResolvedValueOnce({ ok: true, value: { items: [organizedPaper], total: 1 } })
      .mockRejectedValueOnce(new Error('Transient list failure'));
    listOrganizationMock.mockResolvedValue({
      ok: true,
      value: { tags: [managedTag], collections: [] },
    });
    getPaperMock.mockResolvedValue({ ok: true, value: organizedPaper });
    deleteTagMock.mockResolvedValue({ ok: true, value: { id: managedTag.id } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Legacy Library' }));

    await screen.findByText('Confirmable paper', { selector: 'h2' });
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    await screen.findByDisplayValue('Confirmable paper');
    fireEvent.click(screen.getByRole('button', { name: 'Delete tag Managed tag' }));

    expect(
      await screen.findByText(
        'Tag "Managed tag" was deleted, but the library view could not refresh.',
      ),
    ).toBeDefined();
    expect(screen.getByDisplayValue('Confirmable paper')).toBeDefined();
    expect(confirm).toHaveBeenCalledWith('Delete tag "Managed tag" from every paper?');
    confirm.mockRestore();
  });
});
