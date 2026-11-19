/**
 * Feature: pubsub.event-rows
 *
 * redis-oplog publishes each event on several channels: the collection's, one per namespace, and the document's. With
 * **Events of** on, the list shows the event once and keeps the channels it arrived on, each with its time. Two equal
 * events stay two rows: the second one's first message comes from a channel the first row already has.
 */
import { oplogEvent } from './oplog-event';
import type { EventRow, Message, OplogEvent, OplogLink, Row } from './types';
import { messagesOf, sameBytes } from './types';

/** A message joins the row of an event whose first message arrived less than this before it (Datardo's choice). */
export const joinWithinMs = 2000;

/** A message that just arrived, numbered, with what `pubsub.oplog-event` made of it. */
export interface ArrivedMessage {
  readonly message: Message;
  readonly event: OplogEvent | undefined;
}

/** When a row's first message arrived. */
function firstTime(row: Row): number {
  switch (row.kind) {
    case 'message':
      return row.receivedAt;
    case 'gap':
      return row.to;
    case 'event':
      return row.messages[0]?.receivedAt ?? 0;
  }
}

function joins(row: Row, message: Message, event: OplogEvent): row is EventRow {
  const first = row.kind === 'event' ? row.messages[0] : undefined;
  return (
    row.kind === 'event' &&
    first !== undefined &&
    row.event.collection === event.collection &&
    sameBytes(first.message, message.message) &&
    !row.messages.some((each) => sameBytes(each.channel, message.channel))
  );
}

/**
 * The place of the newest row the message joins (rule 2), or undefined when it is a row of its own. The rows are in
 * the order they arrived, so the search stops at the first row older than {@link joinWithinMs}.
 */
export function joinedRow(rows: readonly Row[], arrived: ArrivedMessage): number | undefined {
  const { message, event } = arrived;
  if (event === undefined) {
    return undefined;
  }
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row === undefined || message.receivedAt - firstTime(row) >= joinWithinMs) {
      return undefined;
    }
    if (joins(row, message, event)) {
      return index;
    }
  }
  return undefined;
}

/** The row a message is on its own: an event with one channel, or the message. */
export function rowOf(arrived: ArrivedMessage): Row {
  return arrived.event === undefined
    ? arrived.message
    : { kind: 'event', number: arrived.message.number, event: arrived.event, messages: [arrived.message] };
}

/** The row with one more message: the row keeps its place, its number and its time. */
export function withMessage(row: EventRow, message: Message): EventRow {
  return { ...row, messages: [...row.messages, message] };
}

/** Feature: pubsub.event-rows — the rows after a message arrived. */
export function rowsAfter(rows: readonly Row[], arrived: ArrivedMessage): readonly Row[] {
  const index = joinedRow(rows, arrived);
  const row = index === undefined ? undefined : rows[index];
  if (index === undefined || row?.kind !== 'event') {
    return [...rows, rowOf(arrived)];
  }
  return rows.map((each, place) => (place === index ? withMessage(row, arrived.message) : each));
}

/**
 * The rows built again from the messages they hold (rule 5): with no link, every message is its own row again, in the
 * order they arrived; with a link, the events are made rows by the rules above.
 */
export function rebuiltRows(rows: readonly Row[], link: OplogLink | undefined): readonly Row[] {
  const messages = messagesOf(rows);
  if (link === undefined) {
    return messages;
  }
  const built: Row[] = [];
  for (const message of messages) {
    if (message.kind === 'gap') {
      built.push(message);
      continue;
    }
    const arrived = { message, event: oplogEvent(message.channel, message.message, link) };
    const index = joinedRow(built, arrived);
    const row = index === undefined ? undefined : built[index];
    if (index !== undefined && row?.kind === 'event') {
      built[index] = withMessage(row, message);
    } else {
      built.push(rowOf(arrived));
    }
  }
  return built;
}
