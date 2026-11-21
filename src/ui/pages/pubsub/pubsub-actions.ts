/**
 * What the controls of a Pub/Sub tab do: an entry of a View starts its feature from its place on the page's
 * connection, with what the window alone knows added (the rows selected for **Copy** and **Export…**, the filter
 * shown); **Show only its messages** and a click on a row change only the window (`pubsub.filter`,
 * `pubsub.inspect`); **Copy name** puts the name on the clipboard. The kind of the field and the filter are kept with
 * the tab by `pubsub.show` with `{ choices }` once they settle, while the tab is shown.
 */
import type { MenuEntry } from '../../../features/pubsub/subscriptions';
import { namedSubscription, subscriptionArgs, type MessageFilter, type NameKind } from '../../../features/pubsub/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { featureId, type ConnectionId, type Place } from '../../../shared/ids';
import type { Target } from '../../../shared/target';
import { changePubSubTab, pubsubTabOf, withoutSelection, type PubSubTab } from './pubsub-store';

/** How long the kind and the filter stay unchanged before the tab keeps them, in ms (as the Server page). */
const settleMs = 600;

/** What the features of a page are started on: its connection. */
export function pageTarget(connection: ConnectionId): Target {
  return { kind: 'connection', connection };
}

/** Starts a feature of the page on its connection and waits for what it gives. */
export function startOn(connection: ConnectionId, feature: string, place: Place, args?: Json): Promise<IntentResult> {
  return window.datardo.start({
    feature: featureId(feature),
    target: pageTarget(connection),
    place,
    ...(args === undefined ? {} : { args }),
  });
}

/** The place of an element written whole (`pubsub.copy@row-menu`), or `fallback` for an entry with none. */
function placeOf(element: string | undefined, fallback: Place): Place {
  return (element?.split('@')[1] ?? fallback) as Place;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const held = new Set<string>();

/** The filter as the arguments of an intent name it: its text, and its subscription as `{ kind, hex }`. */
export function filterArgs(filter: MessageFilter): Json {
  return {
    text: filter.text,
    ...(filter.subscription === undefined ? {} : { subscription: subscriptionArgs(filter.subscription) }),
  };
}

function keepChoices(tab: string): void {
  timers.delete(tab);
  const state = pubsubTabOf(tab);
  if (state !== undefined) {
    const marked = state.filter.subscription;
    void startOn(state.connection, 'pubsub.show', 'toolbar', {
      choices: {
        nameKind: state.nameKind,
        filter: state.filter.text,
        ...(marked === undefined ? {} : { filterSubscription: subscriptionArgs(marked) }),
      },
    });
  }
}

function settle(tab: string): void {
  const timer = timers.get(tab);
  if (timer !== undefined) {
    clearTimeout(timer);
  }
  timers.set(
    tab,
    setTimeout(() => {
      keepChoices(tab);
    }, settleMs),
  );
}

/** Changes the kind of the field; the tab keeps it once it settles. */
export function chooseNameKind(tab: string, nameKind: NameKind): void {
  changePubSubTab(tab, (state) => ({ ...state, nameKind }));
  settle(tab);
}

/** Changes the filter; the tab keeps it once it settles. */
export function changeFilter(tab: string, change: (filter: MessageFilter) => MessageFilter): void {
  changePubSubTab(tab, (state) => ({ ...state, filter: change(state.filter) }));
  settle(tab);
}

/** The tab stops being shown: what was not kept yet waits until it is shown again. */
export function holdChoices(tab: string): void {
  const timer = timers.get(tab);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(tab);
    held.add(tab);
  }
}

/** The tab is shown again: what it held is kept now. */
export function keepHeldChoices(tab: string): void {
  if (held.delete(tab)) {
    keepChoices(tab);
  }
}

/** **Subscribe** and `Enter` in the field: the names typed, with the kind chosen; the field is emptied once done. */
export async function subscribeTyped(tab: string): Promise<void> {
  const state = pubsubTabOf(tab);
  if (state === undefined || state.typed.trim() === '') {
    return;
  }
  const result = await startOn(state.connection, 'pubsub.subscribe', 'toolbar', {
    names: state.typed,
    kind: state.nameKind,
  });
  if (result.kind === 'done') {
    changePubSubTab(tab, (now) => (now.typed === state.typed ? { ...now, typed: '' } : now));
  }
}

/** What **Export…** is started with: the rows selected and the filter, which the window alone knows. */
export function exportArgs(state: PubSubTab, selected: readonly number[]): Json {
  return { selected: [...selected], filter: filterArgs(state.filter) };
}

function fieldsOf(args: Json | undefined): Readonly<Record<string, Json>> {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as Readonly<Record<string, Json>>)
    : {};
}

/** Shows a row in the inspector island. */
export function inspectRow(tab: string, number: number): void {
  changePubSubTab(tab, (state) => {
    const { format: _format, ...rest } = state;
    return { ...rest, selected: [number], anchor: number, inspected: number };
  });
}

/** Carries out an entry of a View, from its place; a disabled entry does nothing. */
export function act(tab: string, entry: MenuEntry, fallback: Place, selected: readonly number[] = []): void {
  const state = pubsubTabOf(tab);
  if (state === undefined || entry.disabled !== undefined) {
    return;
  }
  if (entry.copies !== undefined) {
    void navigator.clipboard.writeText(entry.copies);
    return;
  }
  const place = placeOf(entry.element, fallback);
  const args = fieldsOf(entry.args);
  switch (entry.feature) {
    case undefined:
      return;
    case 'pubsub.filter': {
      const marked = namedSubscription(args['subscription']);
      changeFilter(tab, (filter) => {
        const { subscription: _was, ...rest } = filter;
        return marked === undefined ? rest : { ...rest, subscription: marked };
      });
      return;
    }
    case 'pubsub.inspect':
      if (typeof args['row'] === 'number') {
        inspectRow(tab, args['row']);
      }
      return;
    case 'pubsub.copy':
      void startOn(state.connection, 'pubsub.copy', place, { ...args, rows: args['rows'] ?? [...selected] });
      return;
    case 'pubsub.export':
      void startOn(state.connection, 'pubsub.export', place, exportArgs(state, selected));
      return;
    default:
      void startOn(state.connection, entry.feature, place, entry.args);
  }
}

/** Ends the selection, and empties the inspector island. */
export function clearSelection(tab: string): void {
  changePubSubTab(tab, withoutSelection);
}

/**
 * Selects a row of the rows shown (`numbers`, from the top): alone with a click, added or taken away with `Ctrl`, or
 * every row from the last one clicked with `Shift`. The inspector island shows the row clicked.
 */
export function selectRow(
  tab: string,
  number: number,
  how: 'only' | 'toggle' | 'range',
  numbers: readonly number[],
): void {
  changePubSubTab(tab, (state) => {
    if (how === 'only') {
      const { format: _format, ...rest } = state;
      return { ...rest, selected: [number], anchor: number, inspected: number };
    }
    if (how === 'toggle') {
      const selected = state.selected.includes(number)
        ? state.selected.filter((each) => each !== number)
        : [...state.selected, number];
      return { ...state, selected, anchor: number, inspected: number };
    }
    const from = numbers.indexOf(state.anchor ?? number);
    const to = numbers.indexOf(number);
    const [first, last] = from < 0 ? [to, to] : [Math.min(from, to), Math.max(from, to)];
    return { ...state, selected: numbers.slice(first, last + 1), inspected: number };
  });
}

/** `Ctrl+A`: every row the filter shows. */
export function selectAll(tab: string, numbers: readonly number[]): void {
  changePubSubTab(tab, (state) => ({ ...state, selected: [...numbers] }));
}
