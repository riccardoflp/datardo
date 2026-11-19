/**
 * Feature: watch.copy-events
 *
 * Copies one change event as the server sent it, in mongosh syntax on several lines (`query.format`), or, for
 * **Copy the events shown**, a list `[ … ]` of those that pass the toggles and the search, oldest first. It writes
 * nothing; the status line says *Copied to the clipboard*.
 *
 * Started on the page's tab with `{ number }` for one change event, or `{ shown: true }` for those shown.
 */
import type { Json } from '../../shared/engine-request';
import { noDanger, run, type Answers, type Context, type Outcome } from '../../shared/feature';
import { formattedValue, prettyWidth } from '../aggregate/mongosh/format';
import { objectOf } from '../history/types';
import { contextPage, type WatchPage } from './page/state';
import { controlText, copyText } from './text';
import type { WatchEvent } from './types';
import { visibleEvents } from './visible-events';

/** The text of change events: one as a document, several as a list, in mongosh syntax on several lines. */
export function eventsText(events: readonly WatchEvent[], asList: boolean): string {
  const value: Json = asList ? events.map((event) => event.event) : (events[0]?.event ?? null);
  return formattedValue(value, { kind: 'pretty', width: prettyWidth });
}

/** The change events shown on the page, oldest first. */
export function shownOldestFirst(page: WatchPage): readonly WatchEvent[] {
  return [...visibleEvents(page.events, page.hiddenTypes, page.search).shown].reverse();
}

/** Feature: watch.copy-events — no step; what follows copies the change event, or those shown. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = objectOf(answers['args'] as Json | undefined);
  const page = contextPage(context)?.page;
  const shown = args['shown'] === true;
  const events =
    page === undefined
      ? []
      : shown
        ? shownOldestFirst(page)
        : page.events.filter((event) => event.number === args['number']);
  const copies = shown || events.length > 0;
  return run({
    title: shown ? copyText.titleShown : copyText.titleOne,
    steps: [],
    danger: noDanger,
    undo: { cannot: controlText.nothingWritten },
    publishes: false,
    after: copies
      ? [
          { kind: 'copy', text: eventsText(events, shown) },
          { kind: 'notify', level: 'success', text: copyText.copied },
        ]
      : [],
  });
}
