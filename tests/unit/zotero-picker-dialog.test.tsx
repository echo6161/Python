import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ZoteroPickerDialog } from '../../src/renderer/components/workspace/ZoteroPickerDialog';
import type { PaperMindApi } from '../../src/shared/contracts/app';
import type { WorkspaceZoteroPaperInput } from '../../src/shared/contracts/workspace';
import type { ZoteroCollection, ZoteroItemSummary } from '../../src/shared/contracts/zotero';

const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440001';
const item = makeItem('PAPERAA2', 'Already in Workspace');
const selectable = makeItem('PAPERAB2', 'Selectable paper');
const nextPageItem = makeItem('PAPERAC2', 'Next-page paper');
const collection: ZoteroCollection = {
  ref: {
    serverId: 'ServerIdentity01',
    library: { type: 'user', id: '0' },
    collectionKey: 'COLLECT2',
  },
  name: 'Methods',
  parent: null,
  version: 1,
};
const listItems = vi.fn();
const searchItems = vi.fn();
const listCollectionItems = vi.fn();
const addPaper = vi.fn();

describe('ZoteroPickerDialog', () => {
  const onAdded = vi.fn();

  beforeEach(() => {
    listItems
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        value: { items: [item, selectable], start: 0, limit: 20, total: 21, hasNext: true },
      })
      .mockResolvedValue({
        ok: true,
        value: { items: [nextPageItem], start: 20, limit: 20, total: 21, hasNext: false },
      });
    searchItems.mockReset().mockResolvedValue({
      ok: true,
      value: { items: [selectable], start: 0, limit: 20, total: 1, hasNext: false },
    });
    listCollectionItems.mockReset().mockResolvedValue({ ok: true, value: [selectable] });
    addPaper.mockReset().mockImplementation(({ workspaceId, itemRef }: WorkspaceZoteroPaperInput) =>
      Promise.resolve({
        ok: true,
        value: {
          workspaceId,
          itemRef,
          addedAt: '2026-08-11T00:00:00.000Z',
          sortOrder: 0,
          availability: 'available',
          item: selectable,
        },
      }),
    );
    onAdded.mockReset();
    installApi();
  });

  it('deduplicates existing items and adds a cross-page multi-selection', async () => {
    render(
      <ZoteroPickerDialog
        existingRefs={new Set(['ServerIdentity01:user:0:PAPERAA2'])}
        workspaceId={WORKSPACE_ID}
        onAdded={onAdded}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText('Already added')).toBeDefined();
    expect(screen.getByLabelText<HTMLInputElement>('Select Already in Workspace').disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByLabelText('Select Selectable paper'));
    fireEvent.click(screen.getByRole('button', { name: 'Next Zotero picker page' }));
    expect(await screen.findByText('Next-page paper')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Select Next-page paper'));
    fireEvent.click(screen.getByRole('button', { name: 'Add selected (2)' }));

    await waitFor(() => expect(addPaper).toHaveBeenCalledTimes(2));
    expect(addPaper).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, itemRef: selectable.ref });
    expect(addPaper).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, itemRef: nextPageItem.ref });
    expect(await screen.findByText('2 added.')).toBeDefined();
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('filters through a controlled Zotero collection and supports empty results', async () => {
    render(
      <ZoteroPickerDialog
        existingRefs={new Set()}
        workspaceId={WORKSPACE_ID}
        onAdded={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await screen.findByText('Selectable paper');
    fireEvent.change(screen.getByLabelText('Filter by Zotero collection'), {
      target: { value: 'ServerIdentity01:user:0:COLLECT2' },
    });
    await waitFor(() => expect(listCollectionItems).toHaveBeenCalledWith(collection.ref));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Zotero papers' }), {
      target: { value: 'no such paper' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No matching Zotero papers.')).toBeDefined();
  });

  it('shows a recoverable state when Zotero is not running', async () => {
    const detectZotero = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        value: {
          available: false,
          apiVersion: null,
          serverIdentity: null,
          error: { code: 'not_running', message: 'Zotero is not running.' },
        },
      })
      .mockResolvedValue({
        ok: true,
        value: {
          available: true,
          apiVersion: 3,
          serverIdentity: { serverId: 'ServerIdentity01', schemaVersion: 42, kind: 'server' },
          error: null,
        },
      });
    installApi({ detectZotero });
    render(
      <ZoteroPickerDialog
        existingRefs={new Set()}
        workspaceId={WORKSPACE_ID}
        onAdded={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect((await screen.findByRole('alert')).textContent).toContain('Zotero is not running.');
    expect(screen.getByText('Start Zotero, then retry.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Selectable paper')).toBeDefined();
  });

  it('recovers after a paginated Zotero request fails', async () => {
    listItems
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        value: { items: [selectable], start: 0, limit: 20, total: 21, hasNext: true },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'TIMEOUT', message: 'The next Zotero page timed out.' },
      })
      .mockResolvedValue({
        ok: true,
        value: { items: [selectable], start: 0, limit: 20, total: 21, hasNext: true },
      });
    render(
      <ZoteroPickerDialog
        existingRefs={new Set()}
        workspaceId={WORKSPACE_ID}
        onAdded={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText('Selectable paper')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Next Zotero picker page' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'The next Zotero page timed out.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Selectable paper')).toBeDefined();
  });
});

function installApi(zoteroOverrides: Partial<PaperMindApi['zotero']> = {}) {
  const zotero: PaperMindApi['zotero'] = {
    detectZotero: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        available: true,
        apiVersion: 3,
        serverIdentity: { serverId: 'ServerIdentity01', schemaVersion: 42, kind: 'server' },
        error: null,
      },
    }),
    listItems,
    searchItems,
    cancelRequest: vi.fn().mockResolvedValue({ ok: true, value: { cancelled: true } }),
    getItem: vi.fn(),
    listCollections: vi.fn().mockResolvedValue({ ok: true, value: [collection] }),
    listCollectionItems,
    listAttachments: vi.fn(),
    findPrimaryPdf: vi.fn(),
    resolvePdfAvailability: vi.fn(),
    ...zoteroOverrides,
  };
  Object.defineProperty(window, 'paperMind', {
    configurable: true,
    value: { zotero, workspace: { addPaper } },
  });
}

function makeItem(itemKey: string, title: string): ZoteroItemSummary {
  return {
    ref: { serverId: 'ServerIdentity01', library: { type: 'user', id: '0' }, itemKey },
    itemType: 'journalArticle',
    title,
    creators: [{ creatorType: 'author', name: 'Ada Lovelace' }],
    date: '2025',
    year: 2025,
    publication: 'Test Journal',
    pdf: { hasPdf: true, state: 'available', storageMode: 'stored' },
    version: 1,
  };
}
