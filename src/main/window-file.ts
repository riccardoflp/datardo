/**
 * `window.json` (data.md), version 1: the window's place, size and maximized state, which `window.remember` saves and
 * `window.placement` reads. The fields it does not know (the islands' widths of `nav.layout`) are kept and written
 * back. It imports nothing of Electron, so that the tests read it.
 */
import type { Json } from '../shared/engine-request';
import type { JsonObject, StoredFile } from '../storage/store';
import type { Placement } from '../features/window/placement';
import { placementOf } from '../features/window/remember';

/** What `window.json` holds: the placement, when one was saved, and every other field as it was. */
export interface WindowFile {
  readonly placement?: Placement;
  readonly others: Readonly<Record<string, Json>>;
}

const placementFields = ['left', 'top', 'width', 'height', 'maximized'];

/** The kind of `window.json`. */
export const windowFile: StoredFile<WindowFile> = {
  path: 'window.json',
  holds: "The window's size and place",
  version: 1,
  migrations: {},
  empty: () => ({ others: {} }),
  read: (object: JsonObject): WindowFile => {
    const others = Object.fromEntries(
      Object.entries(object).filter(([name]) => name !== 'version' && !placementFields.includes(name)),
    );
    const placement = placementOf(object);
    return placement === undefined ? { others } : { placement, others };
  },
  write: (value: WindowFile): JsonObject => ({ ...(value.placement ?? {}), ...value.others }),
};
