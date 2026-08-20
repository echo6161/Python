import type { ApiResult } from './library';
export const RESEARCH_GRAPH_IPC_CHANNELS = Object.freeze({
  getProjection: 'research-graph:get-projection',
});
export type ResearchGraphIpcChannels = typeof RESEARCH_GRAPH_IPC_CHANNELS;
export type ResearchGraphNodeKind =
  | 'conclusion'
  | 'experiment'
  | 'hypothesis'
  | 'link'
  | 'memory'
  | 'paper'
  | 'plan_task'
  | 'question'
  | 'repository'
  | 'result'
  | 'run'
  | 'workspace';
export interface ResearchGraphNode {
  readonly id: string;
  readonly kind: ResearchGraphNodeKind;
  readonly label: string;
  readonly subtitle: string;
  readonly status: 'available' | 'stale' | 'unavailable';
  readonly relatedId: string | null;
  readonly detail: string;
}
export interface ResearchGraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly relation: string;
}
export interface ResearchGraphProjection {
  readonly workspaceId: string;
  readonly version: 'research-graph-v1';
  readonly nodes: readonly ResearchGraphNode[];
  readonly edges: readonly ResearchGraphEdge[];
}
export interface ResearchGraphApi {
  getProjection(workspaceId: string): Promise<ApiResult<ResearchGraphProjection>>;
}
