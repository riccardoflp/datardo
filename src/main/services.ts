/**
 * What the parts of the main process share once Datardo has started: the state, the data folder, the window. Each
 * area that carries out app steps receives these in `src/main/actions/<area>.ts`.
 */
import type { BrowserWindow } from 'electron';
import type { AppStateHolder } from './app-state';

/** The pieces of the main process an area's actions may use. */
export interface MainServices {
  readonly state: AppStateHolder;
  /** The data folder in use (data.md). */
  readonly dataFolder: string;
  /** The one window of Datardo, when it is open. */
  readonly window: () => BrowserWindow | undefined;
  /** Saves every store that waits to be written: at quit (data.md, "How it is written"). */
  readonly onQuit: (flush: () => Promise<void>) => void;
}
