import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    importedAt: '2026-08-08T00:00:00.000Z',
  },
};

describe('App', () => {
  beforeEach(() => {
    importDroppedPdfsMock.mockClear();
    listPapersMock.mockReset().mockResolvedValue({
      ok: true,
      value: { items: [], total: 0 },
    });
    getPaperMock.mockReset();
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
          updatePaperMetadata: vi.fn(),
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
      },
    });
  });

  it('renders the secure desktop library workspace', async () => {
    render(<App />);

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'All papers' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'PDF reader' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Annotations' })).toBeDefined();
    expect(await screen.findByText('v0.1.0-test')).toBeDefined();
  });

  it('passes dropped PDF files through the preload library API', () => {
    render(<App />);
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

    await screen.findByText('Confirmable paper', { selector: 'h2' });
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    await screen.findByDisplayValue('Confirmable paper');
    fireEvent.click(screen.getByRole('button', { name: 'Remove paper' }));

    expect(screen.getByRole('dialog', { name: 'Remove paper?' })).toBeDefined();
    expect(screen.getByRole('button', { name: /Remove record only/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Remove record and managed copy/ })).toBeDefined();
  });

  it('opens the settings placeholder from the sidebar', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeDefined();
    expect(screen.getByText('No external services are configured.')).toBeDefined();
  });
});
