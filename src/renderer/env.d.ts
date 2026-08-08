/// <reference types="vite/client" />

import type { PaperMindApi } from '../shared/contracts/app';

declare global {
  interface Window {
    readonly paperMind: PaperMindApi;
  }
}

export {};
