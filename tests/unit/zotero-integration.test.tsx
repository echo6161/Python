import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ZoteroIntegration } from '../../src/renderer/components/ZoteroIntegration';
import type { PaperMindApi } from '../../src/shared/contracts/app';
import type { ZoteroAttachment, ZoteroItemDetails } from '../../src/shared/contracts/zotero';

const item: ZoteroItemDetails = {
  ref: {
    serverId: 'ServerIdentity01',
    library: { type: 'user', id: '0' },
    itemKey: 'PARENTA2',
  },
  itemType: 'journalArticle',
  title: 'Zotero source of truth',
  creators: [{ creatorType: 'author', name: 'Ada Lovelace' }],
  year: 2025,
  date: '2025-04-12',
  doi: '10.1000/example',
  abstract: 'A local Zotero record.',
  publication: 'Journal of Tests',
  url: 'https://example.test/paper',
  tags: ['methods'],
  collections: [],
  pdf: { hasPdf: true, state: 'available', storageMode: 'stored' },
  version: 5,
};

const attachment: ZoteroAttachment = {
  ref: { ...item.ref, itemKey: 'STREDAA2' },
  parentItemRef: item.ref,
  title: 'paper.pdf',
  filename: 'paper.pdf',
  contentType: 'application/pdf',
  linkMode: 'imported_file',
  isPdf: true,
  pdf: { hasPdf: true, state: 'available', storageMode: 'stored' },
  version: 2,
};

describe('ZoteroIntegration', () => {
  const detectZotero = vi.fn();
  const searchItems = vi.fn();
  const getItem = vi.fn();
  const listItems = vi.fn();
  const listAttachments = vi.fn();
  const cancelRequest = vi.fn();

  beforeEach(() => {
    detectZotero.mockReset().mockResolvedValue({
      ok: true,
      value: {
        available: true,
        apiVersion: 3,
        serverIdentity: { serverId: 'ServerIdentity01', schemaVersion: 42, kind: 'server' },
        error: null,
      },
    });
    searchItems.mockReset().mockResolvedValue({
      ok: true,
      value: { items: [item], start: 0, limit: 20, total: 1, hasNext: false },
    });
    getItem.mockReset().mockResolvedValue({ ok: true, value: item });
    listItems.mockReset().mockResolvedValue({
      ok: true,
      value: { items: [], start: 0, limit: 20, total: 0, hasNext: false },
    });
    listAttachments.mockReset().mockResolvedValue({ ok: true, value: [attachment] });
    cancelRequest.mockReset().mockResolvedValue({ ok: true, value: { cancelled: true } });
    Object.defineProperty(window, 'paperMind', {
      configurable: true,
      value: {
        zotero: {
          detectZotero,
          searchItems,
          getItem,
          listItems,
          cancelRequest,
          listCollections: vi.fn(),
          listCollectionItems: vi.fn(),
          listAttachments,
          findPrimaryPdf: vi.fn(),
          resolvePdfAvailability: vi.fn(),
        },
      } satisfies Pick<PaperMindApi, 'zotero'>,
    });
  });

  it('shows connection status, searches Zotero, and displays mapped metadata', async () => {
    render(<ZoteroIntegration />);

    expect(await screen.findByText('Status: Connected')).toBeDefined();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Zotero' }), {
      target: { value: 'source of truth' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search Zotero' }));

    expect(await screen.findByText('Zotero source of truth')).toBeDefined();
    expect(searchItems).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'source of truth', start: 0, limit: 20 }),
    );
    expect(screen.getByText('Stored PDF')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Zotero source of truth/ }));
    expect(await screen.findByText('10.1000/example')).toBeDefined();
    expect(screen.getByText('A local Zotero record.')).toBeDefined();
    expect(screen.getByRole('list', { name: 'Zotero attachments' }).textContent).toContain(
      'paper.pdf',
    );
  });

  it('handles Zotero not running without disabling the rest of the app shell', async () => {
    detectZotero.mockResolvedValue({
      ok: true,
      value: {
        available: false,
        apiVersion: null,
        serverIdentity: null,
        error: { code: 'not_running', message: 'Zotero is not running.' },
      },
    });

    render(<ZoteroIntegration />);

    expect(await screen.findByText('Status: Not Running')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('Zotero is not running.');
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Search Zotero' }).disabled,
      ).toBe(true),
    );
  });

  it.each([
    ['timeout', 'Zotero did not respond in time.'],
    ['invalid_response', 'Zotero returned invalid data.'],
    ['server_error', 'Zotero returned an error.'],
    ['api_disabled', 'Zotero local API access is disabled.'],
  ] as const)('shows an unavailable state for %s', async (code, message) => {
    detectZotero.mockResolvedValue({
      ok: true,
      value: {
        available: false,
        apiVersion: null,
        serverIdentity: null,
        error: { code, message },
      },
    });

    render(<ZoteroIntegration />);

    const alert = await screen.findByRole('alert');
    expect(screen.getByText('Status: Unavailable')).toBeDefined();
    expect(alert.textContent).toContain(message);
  });

  it('pages through bounded Zotero search results', async () => {
    searchItems
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        value: { items: [item], start: 0, limit: 20, total: 21, hasNext: true },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          items: [{ ...item, ref: { ...item.ref, itemKey: 'PARENTB2' }, title: 'Last result' }],
          start: 20,
          limit: 20,
          total: 21,
          hasNext: false,
        },
      });
    render(<ZoteroIntegration />);
    expect(await screen.findByText('Status: Connected')).toBeDefined();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Zotero' }), {
      target: { value: 'cancel' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search Zotero' }));
    expect(await screen.findByText('1-1 of 21')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Next Zotero page' }));

    expect(await screen.findByText('Last result')).toBeDefined();
    expect(searchItems).toHaveBeenLastCalledWith(expect.objectContaining({ start: 20, limit: 20 }));
    expect(screen.getByText('21-21 of 21')).toBeDefined();
  });

  it('cancels the active Zotero search with its opaque request ID', async () => {
    let finishSearch: ((value: unknown) => void) | undefined;
    searchItems.mockReset().mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSearch = resolve;
        }),
    );
    cancelRequest.mockImplementation(() => {
      finishSearch?.({
        ok: false,
        error: { code: 'ZOTERO_CANCELLED', message: 'The Zotero request was cancelled.' },
      });
      return Promise.resolve({ ok: true, value: { cancelled: true } });
    });
    render(<ZoteroIntegration />);
    expect(await screen.findByText('Status: Connected')).toBeDefined();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Zotero' }), {
      target: { value: 'page' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search Zotero' }));
    const cancelButton = await screen.findByRole('button', { name: 'Cancel Zotero request' });

    fireEvent.click(cancelButton);

    await waitFor(() => expect(cancelRequest).toHaveBeenCalledTimes(1));
    expect(cancelRequest).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/u));
    expect((await screen.findByRole('alert')).textContent).toContain('cancelled');
  });

  it('recovers its visible status after Zotero restarts', async () => {
    detectZotero
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        value: {
          available: false,
          apiVersion: null,
          serverIdentity: null,
          error: { code: 'not_running', message: 'Zotero is not running.' },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          available: true,
          apiVersion: 3,
          serverIdentity: { serverId: 'ServerIdentity01', schemaVersion: 42, kind: 'server' },
          error: null,
        },
      });
    render(<ZoteroIntegration />);
    expect(await screen.findByText('Status: Not Running')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Status: Connected')).toBeDefined();
  });
});
