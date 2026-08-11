import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceCorePanel } from '../../src/renderer/components/WorkspaceCorePanel';
import type { Workspace, WorkspaceApi } from '../../src/shared/contracts/workspace';

const workspace: Workspace = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Evidence review',
  description: '',
  researchGoal: '',
  status: 'active',
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  rowVersion: 1,
};

describe('WorkspaceCorePanel', () => {
  let createWorkspace: ReturnType<typeof vi.fn<WorkspaceApi['create']>>;

  beforeEach(() => {
    createWorkspace = vi.fn<WorkspaceApi['create']>().mockResolvedValue({
      ok: true,
      value: workspace,
    });
    const api: WorkspaceApi = {
      create: createWorkspace,
      get: vi.fn(),
      list: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      update: vi.fn(),
      setStatus: vi.fn(),
      delete: vi.fn(),
      getLastActive: vi.fn().mockResolvedValue({ ok: true, value: null }),
      setLastActive: vi.fn().mockResolvedValue({ ok: true, value: workspace }),
      addPaper: vi.fn(),
      removePaper: vi.fn(),
      listPapers: vi.fn(),
    };
    Object.defineProperty(window, 'paperMind', {
      configurable: true,
      value: { workspace: api },
    });
  });

  it('creates a Workspace through the typed preload API', async () => {
    render(<WorkspaceCorePanel />);
    await screen.findByText('No research workspaces.');
    fireEvent.change(screen.getByLabelText('Workspace name'), {
      target: { value: 'Evidence review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Evidence review')).toBeDefined();
    await waitFor(() =>
      expect(createWorkspace).toHaveBeenCalledWith({
        name: 'Evidence review',
        description: '',
        researchGoal: '',
      }),
    );
  });
});
