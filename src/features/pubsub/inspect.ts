/**
 * Feature: pubsub.inspect
 *
 * The message selected, whole, in the inspector island: its channel as title, when it was received to the
 * millisecond, the subscription it came through, its size, the event it is (with the channels it arrived on, each
 * with its time), and its value as `value.format` shows it, with the choice of **Text**, **JSON** and **Hexadecimal**.
 * The value is given as bytes: the inspector draws it a part at a time, as `value.format` does for a large value.
 */
import { publishArgs } from './messages';
import { gapText } from './reconnect';
import type { MenuEntry } from './subscriptions';
import { text } from './text';
import type { EventRow, Message, OplogEvent, PubSubPage, Row, ShownFormat } from './types';
import { keptRows, localTime, nameText, shownFormat, textOf } from './types';

/** One of **Text**, **JSON** and **Hexadecimal**: a value that is not valid UTF-8 can be shown only in hexadecimal. */
export interface FormatChoice {
  readonly format: ShownFormat;
  readonly label: string;
  readonly chosen: boolean;
  readonly enabled: boolean;
}

/** What the inspector island shows of a message, or of an event. */
export interface MessageInspection {
  readonly kind: 'message';
  readonly title: string;
  readonly received: { readonly label: string; readonly value: string };
  readonly through: { readonly label: string; readonly value: string };
  readonly size: { readonly label: string; readonly value: string };
  readonly event?: readonly { readonly label: string; readonly value: string }[];
  /** For an event: the channels it arrived on, each with the time it arrived. */
  readonly channels?: {
    readonly label: string;
    readonly items: readonly { readonly channel: string; readonly received: string }[];
  };
  readonly value: { readonly bytes: Uint8Array; readonly choices: readonly FormatChoice[] };
  readonly copy: MenuEntry;
  readonly publishAgain: MenuEntry;
}

/** What the inspector island shows: a message, the sentence of a gap, or nothing (the island is hidden). */
export type InspectView = MessageInspection | { readonly kind: 'gap'; readonly title: string } | undefined;

/** The date and the time to the millisecond: `2026-11-17 14:05:09.123`. */
export function receivedText(milliseconds: number, offsetMinutes: number): string {
  const time = localTime(milliseconds, offsetMinutes);
  return `${time.year}-${time.month}-${time.day} ${time.hours}:${time.minutes}:${time.seconds}.${time.milliseconds}`;
}

function choicesOf(bytes: Uint8Array): readonly FormatChoice[] {
  const shown = shownFormat(bytes);
  const isText = textOf(bytes) !== undefined;
  return (['text', 'json', 'hex'] as const).map((format) => ({
    format,
    label: text.inspect.formats[format],
    chosen: format === shown,
    enabled: format === 'hex' || isText,
  }));
}

function eventLines(event: OplogEvent): readonly { readonly label: string; readonly value: string }[] {
  return [
    { label: text.inspect.operation, value: event.operation },
    { label: text.inspect.collection, value: event.collection },
    { label: text.inspect.document, value: event.document },
    { label: text.inspect.fields, value: (event.fields ?? []).join(', ') },
  ];
}

function throughText(message: Message): string {
  return message.pattern === undefined
    ? text.inspect.throughChannel(nameText(message.channel))
    : text.inspect.throughPattern(nameText(message.pattern));
}

function eventParts(row: EventRow, offsetMinutes: number): Pick<MessageInspection, 'event' | 'channels'> {
  return {
    event: eventLines(row.event),
    channels: {
      label: text.inspect.channels,
      items: row.messages.map((each) => ({
        channel: nameText(each.channel),
        received: receivedText(each.receivedAt, offsetMinutes),
      })),
    },
  };
}

function inspection(row: EventRow | Message, page: PubSubPage, readOnly: string | undefined): MessageInspection {
  const message = row.kind === 'event' ? row.messages[0] : row;
  if (message === undefined) {
    throw new Error('An event row holds at least one message.');
  }
  return {
    kind: 'message',
    title: nameText(message.channel),
    received: { label: text.inspect.received, value: receivedText(message.receivedAt, page.offsetMinutes) },
    through: { label: text.inspect.through, value: throughText(message) },
    size: { label: text.inspect.size, value: text.inspect.bytes(message.message.length) },
    ...(row.kind === 'event' ? eventParts(row, page.offsetMinutes) : {}),
    value: { bytes: message.message, choices: choicesOf(message.message) },
    copy: {
      label: text.copy.copy,
      feature: 'pubsub.copy',
      element: 'pubsub.copy@inspector',
      args: { variant: 'message', rows: [row.number] },
    },
    publishAgain: {
      label: text.messages.publishAgain,
      feature: 'pubsub.publish',
      element: 'pubsub.publish@inspector',
      args: publishArgs(message),
      ...(readOnly === undefined ? {} : { disabled: readOnly }),
    },
  };
}

/** What the inspector island is drawn from: the page, whose `inspected` row is shown. */
export interface InspectInput {
  readonly page: PubSubPage;
  /** The tooltip of **Publish again…** on a read-only connection. */
  readonly readOnly?: string;
}

/**
 * Feature: pubsub.inspect — the row selected, or nothing when no row is selected or the row was dropped by the limit
 * or by **Clear**.
 */
export function view(input: InspectInput): InspectView {
  const { page } = input;
  const row: Row | undefined =
    page.inspected === undefined ? undefined : keptRows(page.kept).find((each) => each.number === page.inspected);
  if (row === undefined) {
    return undefined;
  }
  return row.kind === 'gap'
    ? { kind: 'gap', title: gapText(row, page.offsetMinutes) }
    : inspection(row, page, input.readOnly);
}
