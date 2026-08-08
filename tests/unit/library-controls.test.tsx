import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BatchActionBar } from '../../src/renderer/components/BatchActionBar';
import { LibraryFilterPanel } from '../../src/renderer/components/LibraryFilterPanel';
import {
  PaperDetailsPanel,
  type PaperDetailsSaveInput,
} from '../../src/renderer/components/PaperDetailsPanel';
import { PaperListPanel } from '../../src/renderer/components/PaperListPanel';
import type {
  Collection,
  LibraryOrganization,
  PaperDetails,
  PaperListQuery,
  Tag,
} from '../../src/shared/contracts/library';

const tag: Tag = { id: '550e8400-e29b-41d4-a716-446655440010', name: 'Methods', color: null };
const collection: Collection = {
  id: '550e8400-e29b-41d4-a716-446655440011',
  name: 'Dissertation',
  description: null,
  sortOrder: 0,
};
const organization: LibraryOrganization = { tags: [tag], collections: [collection] };

const paper: PaperDetails = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Local paper',
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
    originalFilename: 'local-paper.pdf',
    internalFilename: `${'a'.repeat(64)}.pdf`,
    byteSize: 512,
    sha256: 'a'.repeat(64),
    mimeType: 'application/pdf',
    pageCount: 1,
    textExtractionStatus: 'succeeded',
    importedAt: '2026-08-08T00:00:00.000Z',
  },
};

describe('Phase 4 library controls', () => {
  it('preserves spaces while entering multi-word filters', () => {
    const changes: PaperListQuery[] = [];

    function Harness() {
      const [query, setQuery] = useState<PaperListQuery>({});
      return (
        <LibraryFilterPanel
          isBusy={false}
          organization={organization}
          query={query}
          onChange={(next) => {
            changes.push(next);
            setQuery(next);
          }}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const title = screen.getByLabelText<HTMLInputElement>('Title');
    fireEvent.change(title, { target: { value: 'deep ' } });
    expect(title.value).toBe('deep ');
    fireEvent.change(title, { target: { value: 'deep learning' } });
    expect(changes.at(-1)?.title).toBe('deep learning');
  });

  it('shows an empty library for a sort-only query and disables controls while busy', () => {
    render(
      <PaperListPanel
        isBusy
        organization={{ tags: [], collections: [] }}
        papers={[]}
        query={{ sortBy: 'updatedAt', sortDirection: 'desc', limit: 100, offset: 0 }}
        selectedId={null}
        selectedIds={[]}
        total={0}
        onBatchApply={vi.fn()}
        onClearSelection={vi.fn()}
        onImport={vi.fn()}
        onQueryChange={vi.fn()}
        onSelect={vi.fn()}
        onToggleSelected={vi.fn()}
      />,
    );

    expect(screen.getByText('Library is empty')).toBeDefined();
    expect(
      screen.getByPlaceholderText<HTMLInputElement>('Search titles and authors').disabled,
    ).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Filters' }).disabled).toBe(true);
  });

  it('clears batch action parameters after applying them', async () => {
    const onApply = vi.fn().mockResolvedValue(true);
    render(
      <BatchActionBar
        isBusy={false}
        organization={organization}
        selectedCount={2}
        onApply={onApply}
        onClear={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('Methods'));
    fireEvent.change(screen.getByLabelText('Set reading status'), {
      target: { value: 'completed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith({
        addTagIds: [tag.id],
        readingStatus: 'completed',
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('Methods').checked).toBe(false),
    );
    expect(screen.getByLabelText<HTMLSelectElement>('Set reading status').value).toBe('');
  });

  it('marks edited evidence and selects organization items only after creation succeeds', async () => {
    const onDirtyChange = vi.fn();
    const onCreateTag = vi.fn().mockResolvedValue(tag);
    const onCreateCollection = vi.fn().mockResolvedValue(collection);
    render(
      <PaperDetailsPanel
        isBusy={false}
        organization={organization}
        paper={paper}
        onCreateCollection={onCreateCollection}
        onCreateTag={onCreateTag}
        onDeleteCollection={vi.fn().mockResolvedValue(true)}
        onDelete={vi.fn()}
        onDeleteTag={vi.fn().mockResolvedValue(true)}
        onDirtyChange={onDirtyChange}
        onSave={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/^DOI/), { target: { value: '10.1000/manual' } });
    expect(screen.getByText('Manual edit: unsaved')).toBeDefined();

    fireEvent.change(screen.getByLabelText('New tag name'), { target: { value: 'Methods' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create tag' }));
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('Methods').checked).toBe(true),
    );
    expect(screen.getByLabelText<HTMLInputElement>('New tag name').value).toBe('');

    fireEvent.change(screen.getByLabelText('New collection name'), {
      target: { value: 'Dissertation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('Dissertation').checked).toBe(true),
    );
    expect(screen.getByLabelText<HTMLInputElement>('New collection name').value).toBe('');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('retains organization names when creation does not succeed', async () => {
    render(
      <PaperDetailsPanel
        isBusy={false}
        organization={organization}
        paper={paper}
        onCreateCollection={vi.fn().mockResolvedValue(null)}
        onCreateTag={vi.fn().mockResolvedValue(null)}
        onDeleteCollection={vi.fn().mockResolvedValue(true)}
        onDelete={vi.fn()}
        onDeleteTag={vi.fn().mockResolvedValue(true)}
        onDirtyChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const input = screen.getByLabelText<HTMLInputElement>('New tag name');
    fireEvent.change(input, { target: { value: 'Retry tag' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create tag' }));
    await waitFor(() => expect(input.value).toBe('Retry tag'));
  });

  it('creates pending organization names before saving paper details', async () => {
    const onCreateTag = vi.fn().mockResolvedValue(tag);
    const onCreateCollection = vi.fn().mockResolvedValue(collection);
    const onSave = vi.fn<(input: PaperDetailsSaveInput) => void>();
    render(
      <PaperDetailsPanel
        isBusy={false}
        organization={{ tags: [], collections: [] }}
        paper={paper}
        onCreateCollection={onCreateCollection}
        onCreateTag={onCreateTag}
        onDeleteCollection={vi.fn().mockResolvedValue(true)}
        onDelete={vi.fn()}
        onDeleteTag={vi.fn().mockResolvedValue(true)}
        onDirtyChange={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText('New tag name'), { target: { value: 'Methods' } });
    fireEvent.change(screen.getByLabelText('New collection name'), {
      target: { value: 'Dissertation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm metadata' }));

    await waitFor(() => expect(onCreateTag).toHaveBeenCalledWith('Methods'));
    await waitFor(() => expect(onCreateCollection).toHaveBeenCalledWith('Dissertation'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0].organization).toMatchObject({
      tagIds: [tag.id],
      collectionIds: [collection.id],
    });
  });

  it('removes deleted tags and collections from the organization draft', async () => {
    const onDeleteTag = vi.fn().mockResolvedValue(true);
    const onDeleteCollection = vi.fn().mockResolvedValue(true);
    render(
      <PaperDetailsPanel
        isBusy={false}
        organization={organization}
        paper={{ ...paper, tags: [tag], collections: [collection] }}
        onCreateCollection={vi.fn().mockResolvedValue(null)}
        onCreateTag={vi.fn().mockResolvedValue(null)}
        onDeleteCollection={onDeleteCollection}
        onDelete={vi.fn()}
        onDeleteTag={onDeleteTag}
        onDirtyChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete tag Methods' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete collection Dissertation' }));
    await waitFor(() => expect(onDeleteTag).toHaveBeenCalledWith(tag));
    await waitFor(() => expect(onDeleteCollection).toHaveBeenCalledWith(collection));
    expect(screen.getByLabelText<HTMLInputElement>('Methods').checked).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>('Dissertation').checked).toBe(false);
  });
});
