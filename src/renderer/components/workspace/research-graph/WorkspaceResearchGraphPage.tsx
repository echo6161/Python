import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Network, PanelRightOpen, X } from 'lucide-react';
import type {
  ResearchGraphNode,
  ResearchGraphNodeKind,
  ResearchGraphProjection,
} from '../../../../shared/contracts/research-graph';
import type { Workspace } from '../../../../shared/contracts/workspace';
const kinds: readonly ResearchGraphNodeKind[] = [
  'question',
  'paper',
  'repository',
  'experiment',
  'hypothesis',
  'run',
  'result',
  'conclusion',
  'memory',
  'plan_task',
  'link',
];
export function WorkspaceResearchGraphPage({
  embedded = false,
  workspace,
}: {
  readonly embedded?: boolean;
  readonly workspace: Workspace;
}) {
  const [projection, setProjection] = useState<ResearchGraphProjection | null>(null),
    [enabled, setEnabled] = useState<readonly ResearchGraphNodeKind[]>(kinds),
    [selected, setSelected] = useState<ResearchGraphNode | null>(null),
    [drawer, setDrawer] = useState(false),
    [error, setError] = useState<string | null>(null),
    [actionStatus, setActionStatus] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void window.paperMind.researchGraph.getProjection(workspace.id).then((r) => {
      if (cancelled) return;
      if (r.ok) setProjection(r.value);
      else setError(r.error.message);
    });
    return () => {
      cancelled = true;
    };
  }, [workspace.id]);
  const graph = useMemo(() => layout(projection, enabled), [projection, enabled]);
  const openAction = async (action: 'github' | 'primary') => {
    if (!selected) return;
    const result = await window.paperMind.crossTool.open({
      workspaceId: workspace.id,
      nodeId: selected.id,
      action,
    });
    if (!result.ok) setActionStatus(result.error.message);
    else
      setActionStatus(
        result.value.opened
          ? `Opened ${result.value.target}.`
          : (result.value.fallback ?? result.value.reason),
      );
  };
  return (
    <div className={`research-graph-page ${embedded ? 'is-embedded' : ''}`}>
      <header>
        <div>
          <h2>
            <Network className="size-4" /> Research Graph
          </h2>
          <p>
            {projection
              ? `${String(projection.nodes.length)} nodes · ${String(projection.edges.length)} relationships · rebuildable`
              : 'Loading projection...'}
          </p>
        </div>
        <button onClick={() => setDrawer(true)}>
          <PanelRightOpen className="size-4" /> Details
        </button>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      <div className="graph-filters" aria-label="Graph filters">
        {kinds.map((k) => (
          <label key={k}>
            <input
              type="checkbox"
              checked={enabled.includes(k)}
              onChange={() =>
                setEnabled((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]))
              }
            />
            <span className={`graph-legend is-${k}`} />
            {k.replaceAll('_', ' ')}
          </label>
        ))}
      </div>
      <div className="graph-work">
        <main aria-label="Research Graph canvas">
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            fitView
            minZoom={0.25}
            maxZoom={1.8}
            onNodeClick={(_, n) => {
              setSelected(projection?.nodes.find((x) => x.id === n.id) ?? null);
              setDrawer(true);
            }}
          >
            <Background color={embedded ? '#d8d5cd' : '#27272a'} gap={22} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </main>
        <aside className={drawer ? 'open' : ''} aria-label="Graph node details">
          <header>
            <strong>Node details</strong>
            <button aria-label="Close Graph details" onClick={() => setDrawer(false)}>
              <X className="size-4" />
            </button>
          </header>
          {selected ? (
            <div>
              <span className={`graph-kind is-${selected.kind}`}>
                {selected.kind.replaceAll('_', ' ')}
              </span>
              <h3>{selected.label}</h3>
              <p>{selected.detail || selected.subtitle}</p>
              <dl>
                <dt>Status</dt>
                <dd>{selected.status}</dd>
                <dt>Relationships</dt>
                <dd>
                  {projection?.edges.filter(
                    (e) => e.source === selected.id || e.target === selected.id,
                  ).length ?? 0}
                </dd>
              </dl>
              {selected.kind === 'repository' ||
              selected.kind === 'paper' ||
              selected.kind === 'memory' ? (
                <div className="graph-actions">
                  {selected.kind === 'repository' ? (
                    <>
                      <button onClick={() => void openAction('primary')}>Open in VS Code</button>
                      <button onClick={() => void openAction('github')}>Open GitHub</button>
                    </>
                  ) : (
                    <button onClick={() => void openAction('primary')}>
                      Open {selected.kind === 'paper' ? 'Zotero' : 'Obsidian'}
                    </button>
                  )}
                  {actionStatus ? <p role="status">{actionStatus}</p> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p>Select a node to inspect canonical provenance.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
function layout(
  p: ResearchGraphProjection | null,
  enabled: readonly ResearchGraphNodeKind[],
): { nodes: Node[]; edges: Edge[] } {
  if (!p) return { nodes: [], edges: [] };
  const visible = p.nodes.filter((n) => n.kind === 'workspace' || enabled.includes(n.kind)),
    ids = new Set(visible.map((n) => n.id)),
    counts = new Map<string, number>(),
    columns = new Map<ResearchGraphNodeKind, number>([
      ['workspace', 0],
      ['question', 1],
      ['paper', 1],
      ['repository', 1],
      ['experiment', 2],
      ['hypothesis', 2],
      ['run', 3],
      ['result', 4],
      ['conclusion', 5],
      ['memory', 5],
      ['plan_task', 3],
      ['link', 2],
    ]);
  const nodes = visible.map((n) => {
    const x = columns.get(n.kind) ?? 1,
      index = counts.get(String(x)) ?? 0;
    counts.set(String(x), index + 1);
    return {
      id: n.id,
      position: { x: x * 245, y: index * 110 },
      data: {
        label: (
          <div className="graph-node-label">
            <span>{n.kind.replaceAll('_', ' ')}</span>
            <strong>{n.label}</strong>
            <small>{n.status}</small>
          </div>
        ),
      },
      className: `graph-node is-${n.kind} status-${n.status}`,
      style: { width: 205 },
    } satisfies Node;
  });
  const edges = p.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map(
      (e) =>
        ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.relation,
          markerEnd: { type: MarkerType.ArrowClosed },
          animated: e.relation === 'supports',
        }) satisfies Edge,
    );
  return { nodes, edges };
}
