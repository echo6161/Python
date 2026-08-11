import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceStatus,
} from '../../shared/contracts/workspace';
import { rendererLogger } from '../logger';

interface WorkspaceFeedback {
  readonly kind: 'error' | 'notice';
  readonly message: string;
}

export interface WorkspaceController {
  readonly workspaces: readonly Workspace[];
  readonly current: Workspace | null;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly feedback: WorkspaceFeedback | null;
  readonly reload: () => Promise<void>;
  readonly select: (workspace: Workspace) => Promise<void>;
  readonly create: (input: CreateWorkspaceInput) => Promise<boolean>;
  readonly update: (input: UpdateWorkspaceInput) => Promise<boolean>;
  readonly setStatus: (status: WorkspaceStatus) => Promise<boolean>;
  readonly deleteCurrent: () => Promise<boolean>;
  readonly clearFeedback: () => void;
}

export function useWorkspaceController(): WorkspaceController {
  const [workspaces, setWorkspaces] = useState<readonly Workspace[]>([]);
  const [current, setCurrent] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<WorkspaceFeedback | null>(null);
  const selectedWorkspaceId = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const [listResult, activeResult] = await Promise.all([
        window.paperMind.workspace.list(),
        window.paperMind.workspace.getLastActive(),
      ]);
      if (!listResult.ok) throw new Error(listResult.error.message);
      if (!activeResult.ok) throw new Error(activeResult.error.message);
      setWorkspaces(listResult.value);
      const restored = activeResult.value;
      setCurrent((selected) => {
        const selectedFromList = selected
          ? listResult.value.find(({ id }) => id === selected.id)
          : null;
        const next =
          restored ??
          selectedFromList ??
          listResult.value.find(({ status }) => status !== 'archived') ??
          listResult.value[0] ??
          null;
        selectedWorkspaceId.current = next?.id ?? null;
        return next;
      });
    } catch (error) {
      rendererLogger.error('Unable to load Workspaces', error);
      setFeedback({ kind: 'error', message: 'Workspaces could not be loaded.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const select = useCallback(async (workspace: Workspace) => {
    setFeedback(null);
    selectedWorkspaceId.current = workspace.id;
    setCurrent(workspace);
    if (workspace.status === 'archived') return;
    const result = await window.paperMind.workspace.setLastActive({ workspaceId: workspace.id });
    if (selectedWorkspaceId.current !== workspace.id) return;
    if (!result.ok || !result.value) {
      setFeedback({
        kind: 'error',
        message: result.ok ? 'The Workspace could not be selected.' : result.error.message,
      });
      return;
    }
    setCurrent(result.value);
  }, []);

  const create = useCallback(
    async (input: CreateWorkspaceInput) => {
      setBusy(true);
      setFeedback(null);
      try {
        const result = await window.paperMind.workspace.create(input);
        if (!result.ok) {
          setFeedback({ kind: 'error', message: result.error.message });
          return false;
        }
        const activeResult = await window.paperMind.workspace.setLastActive({
          workspaceId: result.value.id,
        });
        if (!activeResult.ok || !activeResult.value) {
          setFeedback({
            kind: 'error',
            message: activeResult.ok
              ? 'The new Workspace could not be selected.'
              : activeResult.error.message,
          });
          await load();
          return false;
        }
        const selected = activeResult.value;
        selectedWorkspaceId.current = selected.id;
        setWorkspaces((items) => [selected, ...items]);
        setCurrent(selected);
        setFeedback({ kind: 'notice', message: 'Workspace created.' });
        return true;
      } catch (error) {
        rendererLogger.error('Unable to create Workspace', error);
        setFeedback({ kind: 'error', message: 'Workspace could not be created.' });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const update = useCallback(async (input: UpdateWorkspaceInput) => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await window.paperMind.workspace.update(input);
      if (!result.ok) {
        setFeedback({ kind: 'error', message: result.error.message });
        return false;
      }
      if (selectedWorkspaceId.current === input.id) setCurrent(result.value);
      setWorkspaces((items) => replaceWorkspace(items, result.value));
      setFeedback({ kind: 'notice', message: 'Workspace details saved.' });
      return true;
    } catch (error) {
      rendererLogger.error('Unable to update Workspace', error);
      setFeedback({ kind: 'error', message: 'Workspace details could not be saved.' });
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const setStatus = useCallback(
    async (status: WorkspaceStatus) => {
      if (!current) return false;
      setBusy(true);
      setFeedback(null);
      try {
        const result = await window.paperMind.workspace.setStatus({
          id: current.id,
          rowVersion: current.rowVersion,
          status,
        });
        if (!result.ok) {
          setFeedback({ kind: 'error', message: result.error.message });
          return false;
        }
        if (selectedWorkspaceId.current === current.id) setCurrent(result.value);
        setWorkspaces((items) => replaceWorkspace(items, result.value));
        setFeedback({
          kind: 'notice',
          message:
            status === 'archived'
              ? 'Workspace archived. Zotero data was not changed.'
              : `Workspace is now ${status}.`,
        });
        return true;
      } catch (error) {
        rendererLogger.error('Unable to change Workspace status', error);
        setFeedback({ kind: 'error', message: 'Workspace status could not be changed.' });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [current],
  );

  const deleteCurrent = useCallback(async () => {
    if (!current) return false;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await window.paperMind.workspace.delete({
        id: current.id,
        confirmation: 'DELETE_WORKSPACE',
      });
      if (!result.ok) {
        setFeedback({ kind: 'error', message: result.error.message });
        return false;
      }
      const remaining = workspaces.filter(({ id }) => id !== current.id);
      setWorkspaces(remaining);
      const next = remaining.find(({ status }) => status !== 'archived') ?? remaining[0] ?? null;
      selectedWorkspaceId.current = next?.id ?? null;
      setCurrent(next);
      if (next && next.status !== 'archived') {
        await window.paperMind.workspace.setLastActive({ workspaceId: next.id });
      }
      setFeedback({
        kind: 'notice',
        message: 'Workspace deleted. Zotero items and legacy papers were not changed.',
      });
      return true;
    } catch (error) {
      rendererLogger.error('Unable to delete Workspace', error);
      setFeedback({ kind: 'error', message: 'Workspace could not be deleted.' });
      return false;
    } finally {
      setBusy(false);
    }
  }, [current, workspaces]);

  return {
    workspaces,
    current,
    loading,
    busy,
    feedback,
    reload: load,
    select,
    create,
    update,
    setStatus,
    deleteCurrent,
    clearFeedback: () => setFeedback(null),
  };
}

function replaceWorkspace(items: readonly Workspace[], workspace: Workspace): readonly Workspace[] {
  return items.map((item) => (item.id === workspace.id ? workspace : item));
}
