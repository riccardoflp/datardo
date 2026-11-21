/**
 * What the Watch changes pages need to know of a tab and of an error, for the streams the main process keeps
 * (`src/main/watch-streams.ts`) and for the start of the area (`src/main/watch.ts`).
 */
import type { Json } from '../shared/engine-request';
import type { Tab } from '../shared/state/tabs';
import { defaultMemory, type PageMessage, type WatchMemory, type Watched } from '../shared/state/watch';
import { errorFacts } from '../features/history/oplog-window';
import { objectOf } from '../features/history/types';
import { resumeError } from '../features/watch/resume';
import { watchPage } from '../features/watch/show';
import { streamError } from '../features/watch/stream';

function messageOf(error: unknown): string {
  return errorFacts(error).text || String(error);
}

/** The message of an error of a stream: a standalone server, a resume token too old, or the server's own. */
export function failedMessage(error: unknown): Exclude<PageMessage, { kind: 'invalidated' }> {
  const standalone = streamError(error);
  if (standalone !== undefined) {
    return { kind: 'standalone', text: standalone.message };
  }
  const lost = resumeError(error);
  return { kind: 'error', text: lost === undefined ? messageOf(error) : lost.message };
}

/** What a tab of a Watch changes page watches; `undefined` for any other tab. */
export function watchedOfTab(tab: Tab): Watched | undefined {
  const shows = tab.shows;
  if (shows.kind !== 'page' || shows.page !== watchPage) {
    return undefined;
  }
  const collection = shows.database === undefined ? undefined : shows.of?.[0];
  return {
    connection: shows.connection,
    ...(shows.database === undefined ? {} : { database: shows.database }),
    ...(collection === undefined ? {} : { collection }),
  };
}

/** What a tab remembers of its page. */
export function memoryOfTab(tab: Tab): WatchMemory {
  return tab.memory?.watch ?? defaultMemory;
}

/** The tab a control of the page was started on. */
export function tabOf(args: Json): string {
  const tab = objectOf(args)['tab'];
  if (typeof tab !== 'string') {
    throw new Error('The control of the page names no tab.');
  }
  return tab;
}
