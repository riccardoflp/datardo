/**
 * What the query area does in the main process: a collection tab keeps its query as it was last run (`query.restore`),
 * in `TabMemory.query`, which the session saves (`tab.restore`). The window starts `query.run` with the tab and what
 * it keeps (`args.tab`, `args.keep`, the text `keptText` writes); once the read gave documents, the tab keeps it.
 */
import type { Intent, IntentResult } from '../shared/bridge';
import { keptText, restoredQuery } from '../features/query/restore';
import type { AppStateHolder } from './app-state';

function argument(intent: Intent, name: string): unknown {
  const args = intent.args;
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as Readonly<Record<string, unknown>>)[name]
    : undefined;
}

/** Keeps the query of a collection tab after `query.run` read its documents. */
export function keepTabQuery(state: AppStateHolder, intent: Intent, result: IntentResult): void {
  if (intent.feature !== 'query.run' || result.kind !== 'read') {
    return;
  }
  const tab = argument(intent, 'tab');
  const keep = argument(intent, 'keep');
  const open = state.get().tabs.tabs.find((each) => each.id === tab);
  if (open === undefined || open.shows.kind !== 'collection' || typeof keep !== 'string') {
    return;
  }
  const query = keptText(restoredQuery(keep));
  if (open.memory?.query === query) {
    return;
  }
  state.dispatch({ slice: 'tabs', type: 'changed', tab: open.id, memory: { ...open.memory, query } });
}
