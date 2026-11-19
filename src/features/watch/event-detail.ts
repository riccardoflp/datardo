/**
 * Feature: watch.event-detail
 *
 * Shows, in the inspector island, the selected change event: its type, collection, `_id` and time; **Open document**
 * and **Copy event**; the sections that apply (what changed, the documents it carries) and, last and folded, the
 * change event as the server sent it. Each document is given as a value and as mongosh text, for the view to show as
 * `document.inspect` does, with nothing to edit.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue, prettyWidth } from '../aggregate/mongosh/format';
import { localDateTime } from '../history/time/time-text';
import type { JsonObject } from '../history/types';
import { eventDiff, type EventDiffRow } from './event-diff';
import { detailText, copyText } from './text';
import type { WatchEvent } from './types';

/** A control of the detail: its text, its identifier with its place, and the feature it starts with what. */
export interface EventControl {
  readonly label: string;
  readonly element: string;
  readonly feature: string;
  readonly args: Json;
  readonly tooltip?: string;
}

/** A cell of the table of changes: a value, `—` for a missing one, or a note (*(removed)*, *truncated to 2 …*). */
export type ChangeCell =
  | { readonly kind: 'value'; readonly value: Json; readonly text: string }
  | { readonly kind: 'missing'; readonly text: string }
  | { readonly kind: 'note'; readonly text: string };

/** One line of the table of changes. */
export interface ChangeLine {
  readonly field: string;
  readonly kind: EventDiffRow['kind'];
  readonly cells: readonly ChangeCell[];
}

/** What a section holds. */
export type SectionContent =
  | { readonly kind: 'document'; readonly value: Json; readonly text: string }
  | { readonly kind: 'table'; readonly columns: readonly string[]; readonly lines: readonly ChangeLine[] }
  | { readonly kind: 'note'; readonly text: string };

/** One section of the detail. */
export interface DetailSection {
  readonly title: string;
  readonly folded: boolean;
  readonly content: SectionContent;
}

/** What the detail shows. */
export type EventDetailView =
  | { readonly kind: 'nothing-selected'; readonly text: string }
  | {
      readonly kind: 'event';
      readonly type: string;
      readonly namespace: string;
      readonly id: string;
      readonly time: string;
      readonly buttons: readonly EventControl[];
      readonly sections: readonly DetailSection[];
    };

/** What the detail is drawn from: the change event selected, when it is still in the list. */
export interface EventDetailInput {
  readonly event?: WatchEvent;
  readonly offsetMinutes: number;
}

function pretty(value: Json): string {
  return formattedValue(value, { kind: 'pretty', width: prettyWidth });
}

function valueCell(value: Json): ChangeCell {
  return { kind: 'value', value, text: formattedValue(value, { kind: 'one-line' }) };
}

const missingCell: ChangeCell = { kind: 'missing', text: detailText.missing };

/** The cells of a row: before and after; or the value alone when the values before are not recorded. */
export function changeLine(row: EventDiffRow, withBefore: boolean): ChangeLine {
  const after: ChangeCell =
    row.kind === 'removed'
      ? { kind: 'note', text: detailText.removed }
      : row.kind === 'truncated'
        ? { kind: 'note', text: row.note ?? '' }
        : row.after === undefined
          ? missingCell
          : valueCell(row.after);
  if (!withBefore) {
    return { field: row.path, kind: row.kind, cells: [after] };
  }
  const before = row.before === undefined ? missingCell : valueCell(row.before);
  return { field: row.path, kind: row.kind, cells: [before, after] };
}

function documentSection(title: string, value: JsonObject, folded = false): DetailSection {
  return { title, folded, content: { kind: 'document', value, text: pretty(value) } };
}

function noteSection(title: string, text: string, folded = false): DetailSection {
  return { title, folded, content: { kind: 'note', text } };
}

/** **Changes**, a table of what `watch.event-diff` gives; with no row, *No field changed.* */
function changesSection(event: WatchEvent): DetailSection {
  const withBefore = event.before !== undefined;
  const title = withBefore ? detailText.changes : detailText.changesNoBefore;
  const rows = eventDiff(event);
  if (rows.length === 0) {
    return noteSection(title, detailText.noChange);
  }
  const { columns } = detailText;
  return {
    title,
    folded: false,
    content: {
      kind: 'table',
      columns: withBefore ? [columns.field, columns.before, columns.after] : [columns.field, columns.value],
      lines: rows.map((row) => changeLine(row, withBefore)),
    },
  };
}

function currentSection(event: WatchEvent): DetailSection {
  return event.after === undefined
    ? noteSection(detailText.current, detailText.currentNotRead, true)
    : documentSection(detailText.current, event.after, true);
}

/** The sections of a change event, from the top; **Change event** is always last and folded. */
export function sectionsOf(event: WatchEvent): readonly DetailSection[] {
  const sections: DetailSection[] = [];
  if (event.type === 'update') {
    sections.push(changesSection(event), currentSection(event));
  } else if (event.type === 'replace') {
    const replaced = event.before === undefined ? undefined : changesSection(event);
    const fresh = event.after === undefined ? undefined : documentSection(detailText.newDocument, event.after);
    sections.push(...[replaced ?? fresh].filter((each) => each !== undefined), currentSection(event));
  } else if (event.type === 'insert' && event.after !== undefined) {
    sections.push(documentSection(detailText.inserted, event.after));
  } else if (event.type === 'delete') {
    sections.push(
      event.before === undefined
        ? noteSection(detailText.deleted, detailText.notRecorded)
        : documentSection(detailText.deleted, event.before),
    );
  }
  sections.push(documentSection(detailText.event, event.event, true));
  return sections;
}

/**
 * **Open document** when the change event has an `_id` and a collection and is not a delete; **Copy event**, started
 * on the page's tab.
 */
function buttonsOf(event: WatchEvent): readonly EventControl[] {
  const key = event.event['documentKey'];
  const id = typeof key === 'object' && key !== null && !Array.isArray(key) ? (key as JsonObject)['_id'] : undefined;
  const [database, ...rest] = event.namespace.split('.');
  const collection = rest.join('.');
  const opens = id !== undefined && collection !== '' && event.type !== 'delete';
  const open: EventControl[] = opens
    ? [
        {
          label: detailText.openDocument,
          element: 'document.open@inspector',
          feature: 'document.open',
          args: { database: database ?? '', collection, id },
          tooltip: detailText.openDocumentTip,
        },
      ]
    : [];
  return [
    ...open,
    {
      label: copyText.copyEvent,
      element: 'watch.copy-events@inspector',
      feature: 'watch.copy-events',
      args: { number: event.number },
    },
  ];
}

/** Feature: watch.event-detail — what the inspector shows of the selected change event. */
export function view(input: EventDetailInput): EventDetailView {
  const { event } = input;
  if (event === undefined) {
    return { kind: 'nothing-selected', text: detailText.nothingSelected };
  }
  return {
    kind: 'event',
    type: event.type,
    namespace: event.namespace,
    id: event.id,
    time: localDateTime(event.time, input.offsetMinutes),
    buttons: buttonsOf(event),
    sections: sectionsOf(event),
  };
}
