/**
 * What the user does on a Search documents tab (`search.show`): changing the input, which the tab keeps once it
 * settles while it is the active tab; **Search** and `Enter`, which start a search of the tab in the main process
 * unless the text cannot be searched; **Stop** and `Esc`; folding a group; selecting an item, whose document the
 * inspector island then reads (`document.read`); opening it in a document tab (`document.open`); and following what
 * the main process asks of the page (a scope from the tree, an input from the tool `open_search`).
 */
import { inputAfterAsk, inputChoices, inputJson } from '../../../features/search/model/page';
import { searchStart } from '../../../features/search/show';
import type { SearchInput } from '../../../features/search/types';
import type { Json } from '../../../shared/engine-request';
import { featureId } from '../../../shared/ids';
import type { SearchAsk } from '../../../shared/state/search';
import { startFeature } from '../../shell/intent';
import { documentShows } from '../document/document-actions';
import { changeSearchTab, searchTabOf, type SearchSelection } from './search-store';

/** How long the input stays unchanged before the tab keeps it, in ms (Datardo's choice, as the Server page). */
const settleMs = 600;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const held = new Set<string>();

function keepInput(tab: string): void {
  timers.delete(tab);
  const state = searchTabOf(tab);
  if (state !== undefined) {
    startFeature('search.show', {
      place: 'toolbar',
      target: { kind: 'connection', connection: state.connection },
      args: { choices: JSON.parse(inputChoices(state.input)['search'] ?? '{}') as Json },
    });
  }
}

/** Changes the input of a tab; the tab keeps it once it settles. Nothing is searched again. */
export function changeInput(tab: string, change: (input: SearchInput) => SearchInput): void {
  changeSearchTab(tab, (state) => ({ ...state, input: change(state.input) }));
  const timer = timers.get(tab);
  if (timer !== undefined) {
    clearTimeout(timer);
  }
  timers.set(
    tab,
    setTimeout(() => {
      keepInput(tab);
    }, settleMs),
  );
}

/** The tab stops being shown: an input not kept yet waits until it is shown again, so that no other tab is left. */
export function holdInput(tab: string): void {
  const timer = timers.get(tab);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(tab);
    held.add(tab);
  }
}

/** The tab is shown again: the input it held is kept now. */
export function keepHeldInput(tab: string): void {
  if (held.delete(tab)) {
    keepInput(tab);
  }
}

/** `Enter` and **Search**: a search with what the page shows, or the message of the error line and nothing read. */
export function startSearch(tab: string): void {
  const state = searchTabOf(tab);
  if (state === undefined) {
    return;
  }
  const start = searchStart(state.input);
  if (start.kind === 'error') {
    changeSearchTab(tab, (before) => ({ ...before, error: start.message }));
    return;
  }
  changeSearchTab(tab, ({ error: _error, ...before }) => ({ ...before, folded: [] }));
  startFeature('search.show', {
    place: 'toolbar',
    target: { kind: 'connection', connection: state.connection },
    args: { tab, run: inputJson(state.input) },
  });
}

/** **Stop** and `Esc`: the search of the tab stops, and what it found stays. */
export function stopSearch(tab: string): void {
  const state = searchTabOf(tab);
  if (state !== undefined) {
    startFeature('search.show', {
      place: 'toolbar',
      target: { kind: 'connection', connection: state.connection },
      args: { tab, stop: true },
    });
  }
}

/** Folds or unfolds a group. */
export function toggleGroup(tab: string, key: string): void {
  changeSearchTab(tab, (state) => ({
    ...state,
    folded: state.folded.includes(key) ? state.folded.filter((each) => each !== key) : [...state.folded, key],
  }));
}

/** Selects an item, and reads its document for the inspector island. */
export function selectItem(tab: string, selection: SearchSelection): void {
  const before = searchTabOf(tab);
  if (before === undefined || (before.selected?.key === selection.key && before.selected.idText === selection.idText)) {
    return;
  }
  changeSearchTab(tab, (state) => ({ ...state, selected: selection, inspected: { kind: 'reading' } }));
  void window.datardo
    .start({
      feature: featureId('document.read'),
      target: { kind: 'connection', connection: before.connection },
      place: 'list',
      args: {
        connection: before.connection,
        database: selection.database,
        collection: selection.collection,
        id: selection.id as Json,
      },
    })
    .then((result) => {
      const now = searchTabOf(tab)?.selected;
      if (now?.key !== selection.key || now.idText !== selection.idText) {
        return;
      }
      changeSearchTab(tab, (state) => ({
        ...state,
        inspected:
          result.kind === 'read'
            ? result.result === null
              ? { kind: 'gone' }
              : { kind: 'read', document: result.result as never }
            : { kind: 'failed', message: result.kind === 'failed' || result.kind === 'refused' ? result.message : '' },
      }));
    });
}

/** Clears the selection. */
export function clearSelection(tab: string): void {
  changeSearchTab(tab, ({ selected: _selected, inspected: _inspected, ...state }) => state);
}

/** Opens the document of an item in a document tab, read-only for a view (`document.open`). */
export function openItem(tab: string, selection: SearchSelection): void {
  const state = searchTabOf(tab);
  if (state === undefined) {
    return;
  }
  const where = { connection: state.connection, database: selection.database, collection: selection.collection };
  startFeature('tab.open', {
    place: 'list',
    args: { shows: documentShows(where, selection.id as Json, selection.view) },
  });
}

/** Follows what the main process asked of the page, once: a scope, or an input that starts a search. */
export function followAsk(tab: string, ask: SearchAsk | undefined): void {
  const state = searchTabOf(tab);
  if (ask === undefined || state === undefined || ask.number <= state.askFollowed) {
    return;
  }
  const after = inputAfterAsk(state.input, ask.ask);
  changeSearchTab(tab, (before) => ({ ...before, askFollowed: ask.number }));
  if (after.input !== state.input) {
    changeInput(tab, () => after.input);
  }
  if (after.start) {
    startSearch(tab);
  }
}
