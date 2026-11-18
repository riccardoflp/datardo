/**
 * Where the window opens and what it saves: `window.json` read at start for `window.placement`, written by the app
 * step of `window.remember`. A file that cannot be read or written is not an error for the user (`window.remember`,
 * `window.placement`): the default is used, and a line goes to the Log.
 */
import { screen } from 'electron';
import { placement, type Placement, type Rectangle } from '../features/window/placement';
import { Store } from '../storage/store';
import { windowFile, type WindowFile } from './window-file';

/** The work areas of the displays now connected, the primary one first. */
export function workAreas(): readonly Rectangle[] {
  const primary = screen.getPrimaryDisplay();
  const others = screen.getAllDisplays().filter((display) => display.id !== primary.id);
  return [primary, ...others].map(({ workArea }) => ({
    left: workArea.x,
    top: workArea.y,
    width: workArea.width,
    height: workArea.height,
  }));
}

/** `window.json` of the data folder, and what it says of the window. */
export class WindowPlace {
  private readonly store: Store<WindowFile>;
  private told = false;

  /** Opens nothing yet; `log` writes a line in the Log once, when the file cannot be read or written. */
  constructor(
    folder: string,
    private readonly log: (text: string) => void,
  ) {
    this.store = new Store(folder, windowFile, (error) => {
      this.tellOnce(`the size and place of the window could not be saved: ${String(error)}`);
    });
  }

  /** Reads the file; one that cannot be read gives the default, with no error shown (`window.placement`). */
  async load(): Promise<void> {
    try {
      const found = await this.store.load();
      if (found.kind === 'damaged') {
        this.log(`window.json could not be read and was set aside as ${found.setAsideAs}`);
      }
    } catch (error: unknown) {
      this.tellOnce(`window.json could not be read: ${String(error)}`);
    }
  }

  /** Where the window opens now, with the displays now connected. */
  initial(): Placement {
    return placement(this.store.get().placement, workAreas());
  }

  /** Saves the window's placement at once, so that a process killed a moment later keeps it. */
  async save(saved: Placement): Promise<void> {
    if (this.store.set({ ...this.store.get(), placement: saved })) {
      await this.store.flush();
    }
  }

  /** The other fields of `window.json` (the islands of `nav.layout`), as they were read. */
  others(): WindowFile['others'] {
    return this.store.get().others;
  }

  /** Keeps the other fields of `window.json` (the islands of `nav.layout`), written a moment later as the store does. */
  keepOthers(others: WindowFile['others']): void {
    const now = this.store.get().others;
    const keys = new Set([...Object.keys(now), ...Object.keys(others)]);
    if ([...keys].some((key) => now[key] !== others[key])) {
      this.store.set({ ...this.store.get(), others: { ...now, ...others } });
    }
  }

  /** Writes what waits to be written: at quit. */
  flush(): Promise<void> {
    return this.store.flush();
  }

  private tellOnce(text: string): void {
    if (!this.told) {
      this.told = true;
      this.log(text);
    }
  }
}
