import { ArrowDown, ArrowUp, CheckCircle2, CircleDot, Link2, LockKeyhole } from 'lucide-react';

import type { PlanTask } from '../../../../shared/contracts/research-plan';

export function PlanTaskList({
  tasks,
  selectedId,
  onSelect,
  onMove,
}: {
  readonly tasks: readonly PlanTask[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onMove: (id: string, offset: -1 | 1) => void;
}) {
  if (tasks.length === 0)
    return (
      <p className="p-5 text-sm text-zinc-500">
        No tasks yet. Add the first concrete research action.
      </p>
    );
  return (
    <ol className="divide-y divide-zinc-800" aria-label="Research Plan tasks">
      {tasks.map((task, index) => (
        <li
          className={task.status === 'done' || task.status === 'retired' ? 'opacity-65' : ''}
          key={task.id}
        >
          <div
            className={`grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 ${selectedId === task.id ? 'bg-sky-950/35' : 'hover:bg-zinc-900/70'}`}
          >
            <span className="text-center text-xs tabular-nums text-zinc-600">{index + 1}</span>
            <button className="min-w-0 text-left" type="button" onClick={() => onSelect(task.id)}>
              <span className="flex items-center gap-2">
                {task.status === 'done' ? (
                  <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0 text-emerald-400" />
                ) : task.blockedReason ? (
                  <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0 text-amber-400" />
                ) : (
                  <CircleDot aria-hidden="true" className="size-3.5 shrink-0 text-sky-400" />
                )}
                <span className="truncate text-sm font-medium text-zinc-100">{task.title}</span>
              </span>
              <span className="mt-1 flex items-center gap-3 pl-5 text-xs text-zinc-500">
                <span className="capitalize">{task.status.replaceAll('_', ' ')}</span>
                {task.dependencyIds.length ? (
                  <span>{task.dependencyIds.length} dependencies</span>
                ) : null}
                {task.blockedReason ? (
                  <span className="truncate text-amber-400">{task.blockedReason}</span>
                ) : null}
                {task.references.length ? (
                  <span className="inline-flex items-center gap-1">
                    <Link2 aria-hidden="true" className="size-3" /> {task.references.length}
                  </span>
                ) : null}
              </span>
            </button>
            <div className="flex items-center">
              <button
                aria-label={`Move ${task.title} up`}
                className="icon-button size-7"
                disabled={index === 0}
                type="button"
                onClick={() => onMove(task.id, -1)}
              >
                <ArrowUp aria-hidden="true" className="size-3.5" />
              </button>
              <button
                aria-label={`Move ${task.title} down`}
                className="icon-button size-7"
                disabled={index === tasks.length - 1}
                type="button"
                onClick={() => onMove(task.id, 1)}
              >
                <ArrowDown aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
