/**
 * The part of the app's state that says which Datardo runs, where, and on what: set once at start by the main process.
 */
import type { Platform } from '../feature';

/** Which Datardo runs, on which system, and where its data is. */
export interface AppInfoState {
  readonly version: string;
  readonly platform: Platform;
  /** The system and its architecture as About shows them: `Windows 11 x64`. */
  readonly system: string;
  readonly runtime: { readonly electron: string; readonly chromium: string; readonly node: string };
  /** The data folder in use (data.md). */
  readonly dataFolder: string;
}

/** The events of this part of the state. */
export type AppInfoEvent = { readonly slice: 'app'; readonly type: 'started'; readonly info: AppInfoState };

/** Before the main process has said anything. */
export const initialAppInfo: AppInfoState = {
  version: '0.0.0',
  platform: 'windows',
  system: '',
  runtime: { electron: '', chromium: '', node: '' },
  dataFolder: '',
};

/** Changes this part of the state. */
export function reduceAppInfo(_state: AppInfoState, event: AppInfoEvent): AppInfoState {
  return event.info;
}
