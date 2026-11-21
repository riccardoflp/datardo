/**
 * The state of the Watch changes pages, one for each tab: what is watched, the stream, the change events kept and
 * held, the resume token, and what the tab remembers. It is the part `watch` of the app's state
 * (`src/shared/state/watch.ts`), whose reducer the main process changes it with, from the stream (`watch.stream`) and
 * from the app steps of `watch.pause`, `watch.stop`, `watch.clear` and `watch.visible-events`. This module reads it
 * for the features started on a page.
 */
import type { Context } from '../../../shared/feature';
import type { TabId } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import type { WatchPage, WatchPages } from '../../../shared/state/watch';

export {
  defaultMemory,
  endPause,
  newPage,
  reducePage,
  reduceWatchPages,
  type PageMessage,
  type StreamStatus,
  type WatchMemory,
  type WatchPage,
  type WatchPageEvent,
  type WatchPages,
} from '../../../shared/state/watch';

/** The pages, as the app's state holds them. */
export function watchPagesOf(state: AppState): WatchPages {
  return (state as Partial<AppState>).watch ?? {};
}

/** The page of a tab, when the tab is a Watch changes page. */
export function watchPageOf(state: AppState, tab: string): WatchPage | undefined {
  return watchPagesOf(state)[tab];
}

/** The page a feature was started on, with its tab: its target is the tab of a Watch changes page. */
export function contextPage(context: Context): { readonly tab: TabId; readonly page: WatchPage } | undefined {
  if (context.target.kind !== 'tab') {
    return undefined;
  }
  const tab = context.target.tab;
  const page = watchPageOf(context.state, tab);
  return page === undefined ? undefined : { tab, page };
}
