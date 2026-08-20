import type { ApiResult } from './library';
export const CROSS_TOOL_IPC_CHANNELS = Object.freeze({ open: 'cross-tool:open' });
export type CrossToolIpcChannels = typeof CROSS_TOOL_IPC_CHANNELS;
export type CrossToolAction = 'github' | 'primary';
export interface CrossToolOpenInput {
  readonly workspaceId: string;
  readonly nodeId: string;
  readonly action: CrossToolAction;
}
export interface CrossToolOpenResult {
  readonly opened: boolean;
  readonly target: 'github' | 'obsidian' | 'vscode' | 'zotero';
  readonly reason: string | null;
  readonly fallback: string | null;
}
export interface CrossToolApi {
  open(input: CrossToolOpenInput): Promise<ApiResult<CrossToolOpenResult>>;
}
