import { useState } from 'react';
import { Download, Highlighter, Pencil, Trash2, Underline } from 'lucide-react';

import type {
  Annotation,
  AnnotationColor,
  AnnotationExportFormat,
  UpdateAnnotationInput,
} from '../../shared/contracts/reader';

interface AnnotationSidebarProps {
  readonly paperTitle: string | null;
  readonly annotations: readonly Annotation[];
  readonly isBusy: boolean;
  readonly onDelete: (annotation: Annotation) => Promise<void>;
  readonly onExport: (format: AnnotationExportFormat) => Promise<void>;
  readonly onJump: (pageNumber: number) => void;
  readonly onUpdate: (input: UpdateAnnotationInput) => Promise<void>;
}

const COLORS: readonly AnnotationColor[] = ['yellow', 'green', 'blue', 'pink'];
const SWATCH = { yellow: '#facc15', green: '#34d399', blue: '#60a5fa', pink: '#f472b6' } as const;

export function AnnotationSidebar({
  paperTitle,
  annotations,
  isBusy,
  onDelete,
  onExport,
  onJump,
  onUpdate,
}: AnnotationSidebarProps) {
  const [editing, setEditing] = useState<Annotation | null>(null);
  const [comment, setComment] = useState('');
  const [color, setColor] = useState<AnnotationColor>('yellow');
  const [annotationType, setAnnotationType] = useState<Annotation['annotationType']>('highlight');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const beginEdit = (annotation: Annotation) => {
    setEditing(annotation);
    setComment(annotation.comment ?? '');
    setColor(annotation.color);
    setAnnotationType(annotation.annotationType);
  };

  return (
    <aside
      aria-labelledby="annotations-heading"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-zinc-200 bg-white"
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-4">
        <div>
          <h2 id="annotations-heading" className="text-sm font-semibold text-zinc-900">
            Annotations
          </h2>
          <p className="text-xs tabular-nums text-zinc-500">{annotations.length} saved</p>
        </div>
        <div className="flex gap-1">
          <button
            aria-label="Export Markdown"
            className="icon-button"
            disabled={!paperTitle || isBusy}
            title="Export Markdown"
            type="button"
            onClick={() => void onExport('markdown')}
          >
            <Download aria-hidden="true" className="size-4" />
            <span className="sr-only">Markdown</span>
          </button>
          <button
            className="h-8 rounded border border-zinc-200 px-2 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            disabled={!paperTitle || isBusy}
            title="Export JSON"
            type="button"
            onClick={() => void onExport('json')}
          >
            JSON
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!paperTitle ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-500">
            No active paper
          </div>
        ) : annotations.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-500">
            No annotations
          </div>
        ) : (
          <ol className="divide-y divide-zinc-100">
            {annotations.map((annotation) => (
              <li key={annotation.id} className="px-4 py-3">
                <button
                  className="w-full text-left"
                  type="button"
                  onClick={() => onJump(annotation.pageNumber)}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                    {annotation.annotationType === 'highlight' ? (
                      <Highlighter aria-hidden="true" className="size-3.5" />
                    ) : (
                      <Underline aria-hidden="true" className="size-3.5" />
                    )}
                    Page {annotation.pageNumber}
                    <span
                      aria-label={`${annotation.color} annotation`}
                      className="ml-auto size-2.5 rounded-full"
                      style={{ backgroundColor: SWATCH[annotation.color] }}
                    />
                  </span>
                  <span className="mt-2 line-clamp-3 block text-xs leading-5 text-zinc-600">
                    “{annotation.selectedText}”
                  </span>
                  {annotation.comment ? (
                    <span className="mt-2 block border-l-2 border-zinc-200 pl-2 text-xs leading-5 text-zinc-500">
                      {annotation.comment}
                    </span>
                  ) : null}
                </button>
                {editing?.id === annotation.id ? (
                  <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
                    <div className="flex items-center gap-1">
                      <button
                        aria-label="Highlight"
                        className={`icon-button ${annotationType === 'highlight' ? 'bg-zinc-200 text-zinc-900' : ''}`}
                        title="Highlight"
                        type="button"
                        onClick={() => setAnnotationType('highlight')}
                      >
                        <Highlighter aria-hidden="true" className="size-4" />
                      </button>
                      <button
                        aria-label="Underline"
                        className={`icon-button ${annotationType === 'underline' ? 'bg-zinc-200 text-zinc-900' : ''}`}
                        title="Underline"
                        type="button"
                        onClick={() => setAnnotationType('underline')}
                      >
                        <Underline aria-hidden="true" className="size-4" />
                      </button>
                      {COLORS.map((item) => (
                        <button
                          key={item}
                          aria-label={`${item} annotation`}
                          className={`ml-1 size-4 rounded-full ${color === item ? 'ring-2 ring-zinc-500 ring-offset-1' : ''}`}
                          style={{ backgroundColor: SWATCH[item] }}
                          title={item}
                          type="button"
                          onClick={() => setColor(item)}
                        />
                      ))}
                    </div>
                    <textarea
                      aria-label="Edit annotation comment"
                      className="min-h-20 w-full resize-y rounded border border-zinc-200 p-2 text-xs outline-none focus:border-emerald-600"
                      maxLength={20_000}
                      placeholder="Optional comment"
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="command-button"
                        disabled={isBusy}
                        type="button"
                        onClick={() =>
                          void onUpdate({
                            id: annotation.id,
                            rowVersion: annotation.rowVersion,
                            annotationType,
                            color,
                            comment: comment.trim() || null,
                          }).then(() => setEditing(null))
                        }
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : confirmDeleteId === annotation.id ? (
                  <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs text-red-700">
                    <span>Delete this annotation?</span>
                    <div className="flex gap-2">
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="command-button bg-red-700 hover:bg-red-800"
                        disabled={isBusy}
                        type="button"
                        onClick={() =>
                          void onDelete(annotation).then(() => setConfirmDeleteId(null))
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex justify-end gap-1">
                    <button
                      aria-label="Edit annotation"
                      className="icon-button"
                      title="Edit annotation"
                      type="button"
                      onClick={() => beginEdit(annotation)}
                    >
                      <Pencil aria-hidden="true" className="size-3.5" />
                    </button>
                    <button
                      aria-label="Delete annotation"
                      className="icon-button hover:text-red-700"
                      title="Delete annotation"
                      type="button"
                      onClick={() => setConfirmDeleteId(annotation.id)}
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}
