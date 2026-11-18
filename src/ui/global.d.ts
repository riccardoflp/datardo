import type { Bridge } from '../shared/bridge';

declare global {
  interface Window {
    /** The bridge to the main process (src/preload). */
    readonly datardo: Bridge;
  }
}

export {};
