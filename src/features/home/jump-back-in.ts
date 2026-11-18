/**
 * Feature: home.jump-back-in
 *
 * The things used last, to go on from where the work stopped: the first 8 recent places, most recent first, each with
 * the icon of its kind, its title, the dot and the name of its connection, and its path without the connection.
 * Opening one opens it on the section it had and connects its connection if needed; the filter of the cards does not
 * change this part.
 */
import type { ConnectionColor } from '../../shared/connection';
import type { AppState } from '../../shared/state';
import { recentEntries } from '../palette/recent';
import type { OpenTarget } from '../palette/types';
import { targetKey } from '../tab/same-target';
import { text } from './text';

/** How many recent places are shown (Datardo's choice). */
export const placesShown = 8;

/** One item of **Jump back in**. */
export interface JumpItem {
  /** What it shows, as `tab.same-target` compares it. */
  readonly key: string;
  readonly icon: string;
  readonly title: string;
  readonly connection: string;
  readonly color?: ConnectionColor;
  /** Its path without the connection: `shop / orders`. */
  readonly path: string;
  /** What a click or `Enter` opens: `tab.open` on the section it had (its tab, when it is open). */
  readonly opens: OpenTarget;
  /** What a screen reader says of it. */
  readonly spoken: string;
  readonly menuLabel: string;
}

/** **Jump back in**, or `undefined` when there is no recent place. */
export interface JumpBackIn {
  readonly heading: string;
  readonly clear: { readonly label: string; readonly element: 'home.forget-recent@home' };
  readonly remove: { readonly label: string; readonly element: 'home.forget-recent@home' };
  readonly items: readonly JumpItem[];
}

/** **Jump back in** as Home shows it, when there is at least one recent place. */
export function view(state: AppState): JumpBackIn | undefined {
  const entries = recentEntries(state).slice(0, placesShown);
  if (entries.length === 0) {
    return undefined;
  }
  const platform = state.app.platform;
  const open = new Map(state.tabs.tabs.map((tab) => [targetKey(tab.shows, platform), tab.id]));
  return {
    heading: text.jumpBackIn.heading,
    clear: { label: text.jumpBackIn.clear, element: 'home.forget-recent@home' },
    remove: { label: text.jumpBackIn.remove, element: 'home.forget-recent@home' },
    items: entries.map((entry) => {
      const tab = open.get(entry.key);
      const opens: OpenTarget =
        tab === undefined
          ? {
              kind: 'show',
              shows: entry.place.shows,
              ...(entry.place.section === undefined ? {} : { section: entry.place.section }),
            }
          : { kind: 'tab', tab };
      return {
        key: entry.key,
        icon: entry.icon,
        title: entry.title,
        connection: entry.connection.name,
        ...(entry.connection.color === undefined ? {} : { color: entry.connection.color }),
        path: entry.pathInConnection,
        opens,
        spoken: `${entry.title}, ${entry.connection.name}, ${entry.pathInConnection}`,
        menuLabel: text.jumpBackIn.menu(entry.title),
      };
    }),
  };
}
