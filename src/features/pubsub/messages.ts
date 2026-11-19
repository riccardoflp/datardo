/**
 * Feature: pubsub.messages
 *
 * The list of the messages the page received, the newest at the top, each with the time it arrived, its channel and
 * what it says on one line (`value.format`). With **Events of** on, one row per event (`pubsub.event-rows`), with its
 * operation, its collection, its document and its fields. The table draws only the rows on screen: `range` says which
 * of the rows shown are wanted, counted from the top.
 */
import type { Json } from '../../shared/engine-request';
import { commandWord } from './copy';
import { countsText, isFiltering, messageCount, shownMessages } from './filter';
import { gapText } from './reconnect';
import type { MenuEntry } from './subscriptions';
import { text } from './text';
import type { EventRow, Message, PubSubPage, Row } from './types';
import { hexOf, lineText, localTime, nameText, textOf } from './types';

/** The table adds what arrived at most this many times a second (Datardo's choice). */
export const additionsPerSecond = 10;

/** A screen reader is told of new messages at most this often, in milliseconds (Datardo's choice). */
export const announceEveryMs = 5000;

/** One row of the table. */
export interface MessageRowView {
  readonly number: number;
  readonly kind: Row['kind'];
  /** The text of each column; a message among events, and a gap, span the columns after **Time**. */
  readonly cells: readonly string[];
  readonly spans: boolean;
  /** *through the pattern orders:\**, for a message that arrived through a pattern. */
  readonly tooltip?: string;
  readonly selected: boolean;
  /** A click shows the row in the inspector island. */
  readonly open: MenuEntry;
  readonly menu: readonly MenuEntry[];
}

/** What the table shows. */
export interface MessagesView {
  readonly columns: readonly string[];
  /** The rows of `range`, the newest first. */
  readonly rows: readonly MessageRowView[];
  /** How many rows the filter shows, for the scroll bar. */
  readonly shown: number;
  readonly counts: string;
  /** *The list keeps the last 10,000 messages: …* */
  readonly dropped?: string;
  readonly empty?: string;
  readonly selection?: {
    readonly text: string;
    readonly copy: MenuEntry;
    readonly export: MenuEntry;
    readonly clear: string;
  };
}

/** What the table is drawn from. */
export interface MessagesInput {
  readonly page: PubSubPage;
  readonly now: number;
  /** The tooltip of **Publish again…** on a read-only connection. */
  readonly readOnly?: string;
  /** The rows wanted, from the top; all of them when absent. */
  readonly range?: { readonly start: number; readonly count: number };
}

/** The time a row arrived: `14:05:09.123`, with the date for another day than today, `11-16 14:05:09.123`. */
export function timeText(milliseconds: number, now: number, offsetMinutes: number): string {
  const time = localTime(milliseconds, offsetMinutes);
  const today = localTime(now, offsetMinutes);
  const clock = `${time.hours}:${time.minutes}:${time.seconds}.${time.milliseconds}`;
  const sameDay = time.year === today.year && time.month === today.month && time.day === today.day;
  return sameDay ? clock : `${time.month}-${time.day} ${clock}`;
}

/** The words of a screen reader's announcement of new rows: *12 new messages*. */
export function announceText(rows: number): string {
  return text.messages.announce(rows);
}

/** The button at the top of a table scrolled down: **12 new**. */
export function newRowsText(rows: number): string {
  return text.messages.newRows(rows);
}

function copyEntry(label: string, variant: string, number: number): MenuEntry {
  return { label, feature: 'pubsub.copy', element: 'pubsub.copy@row-menu', args: { variant, rows: [number] } };
}

/** The arguments of **Publish again…**: the channel, and the message as text, or in hexadecimal when it is not. */
export function publishArgs(message: Message): Json {
  const decoded = textOf(message.message);
  const channel = nameText(message.channel);
  return decoded === undefined ? { channel, messageHex: hexOf(message.message) } : { channel, message: decoded };
}

function menuOf(row: Row, message: Message | undefined, readOnly: string | undefined): readonly MenuEntry[] {
  if (message === undefined) {
    return [copyEntry(text.copy.message, 'message', row.number), copyEntry(text.copy.json, 'json', row.number)];
  }
  const copies = [
    copyEntry(text.copy.message, 'message', row.number),
    copyEntry(text.copy.channel, 'channel', row.number),
    copyEntry(text.copy.json, 'json', row.number),
    copyEntry(text.copy.command, 'command', row.number),
  ];
  const publish: MenuEntry = {
    label: text.messages.publishAgain,
    feature: 'pubsub.publish',
    element: 'pubsub.publish@row-menu',
    args: publishArgs(message),
    ...(readOnly === undefined ? {} : { disabled: readOnly }),
  };
  const subscribe: MenuEntry = {
    label: text.messages.subscribeTo,
    feature: 'pubsub.subscribe',
    args: { names: commandWord(message.channel), kind: 'channel' },
  };
  return [...copies, publish, ...(message.pattern === undefined ? [] : [subscribe])];
}

function eventCells(row: EventRow): readonly string[] {
  return [row.event.operation, row.event.collection, row.event.document, (row.event.fields ?? []).join(', ')];
}

function cellsOf(row: Row, input: MessagesInput, events: boolean): Pick<MessageRowView, 'cells' | 'spans'> {
  const { page, now } = input;
  const time = (at: number): string => timeText(at, now, page.offsetMinutes);
  switch (row.kind) {
    case 'gap':
      return { cells: [time(row.from), gapText(row, page.offsetMinutes)], spans: true };
    case 'event':
      return { cells: [time(row.messages[0]?.receivedAt ?? 0), ...eventCells(row)], spans: false };
    case 'message':
      return {
        cells: [time(row.receivedAt), nameText(row.channel), lineText(row.message)],
        spans: events,
      };
  }
}

function rowView(row: Row, input: MessagesInput, events: boolean): MessageRowView {
  const message = row.kind === 'event' ? row.messages[0] : row.kind === 'message' ? row : undefined;
  const pattern = row.kind === 'message' ? row.pattern : undefined;
  return {
    number: row.number,
    kind: row.kind,
    ...cellsOf(row, input, events),
    ...(pattern === undefined ? {} : { tooltip: text.messages.throughPattern(nameText(pattern)) }),
    selected: input.page.selected.includes(row.number),
    open: { label: '', feature: 'pubsub.inspect', element: 'pubsub.inspect@table', args: { row: row.number } },
    menu: menuOf(row, message, input.readOnly),
  };
}

function emptyText(page: PubSubPage, listed: number): string {
  if (listed > 0) {
    return text.messages.noMatch;
  }
  return page.subscriptions.length === 0 ? text.messages.notSubscribed : text.messages.listening;
}

function selectionOf(page: PubSubPage): NonNullable<MessagesView['selection']> {
  return {
    text: text.messages.selected(page.selected.length),
    copy: {
      label: text.copy.copy,
      feature: 'pubsub.copy',
      element: 'pubsub.copy@selection-bar',
      args: { variant: 'message' },
    },
    export: { label: text.show.export, feature: 'pubsub.export', element: 'pubsub.export@selection-bar' },
    clear: text.messages.clearSelection,
  };
}

/** Feature: pubsub.messages — what the table of messages shows. */
export function view(input: MessagesInput): MessagesView {
  const { page } = input;
  const events = page.kept.link !== undefined;
  const shown = [...shownMessages(page.kept.listed, page.filter)].reverse();
  const range = input.range ?? { start: 0, count: shown.length };
  const columns = events
    ? [
        text.messages.time,
        text.messages.operation,
        text.messages.collection,
        text.messages.document,
        text.messages.fields,
      ]
    : [text.messages.time, text.messages.channel, text.messages.message];
  return {
    columns,
    rows: shown.slice(range.start, range.start + range.count).map((row) => rowView(row, input, events)),
    shown: shown.length,
    counts: countsText(messageCount(shown), messageCount(page.kept.listed), isFiltering(page.filter)),
    ...(page.kept.dropped === 0 ? {} : { dropped: text.messages.dropped(page.kept.dropped) }),
    ...(shown.length === 0 ? { empty: emptyText(page, page.kept.listed.length) } : {}),
    ...(page.selected.length === 0 ? {} : { selection: selectionOf(page) }),
  };
}
