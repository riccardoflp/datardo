/**
 * Feature: pubsub.filter
 *
 * Shows only the rows whose channel or message holds every word typed, without case, and, with a subscription chosen
 * by **Show only its messages**, only those that arrived through it. What is received and kept does not change: the
 * filter applies to the messages that arrive later too, and to those a pause holds when they are resumed. A row that
 * marks a gap stays shown, since the messages it warns of may be the very ones looked for.
 */
import { groupThousands } from '../../shared/text-units';
import type { EventRow, Message, MessageFilter, Row } from './types';
import { isThrough, messagesText, nameText, searchedText } from './types';

/** No filter: every row is shown. */
export const noFilter: MessageFilter = { text: '' };

/** Whether a filter is on: a word typed, or a subscription chosen. */
export function isFiltering(filter: MessageFilter): boolean {
  return filter.text.trim() !== '' || filter.subscription !== undefined;
}

function wordsOf(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word !== '');
}

function arrivedThrough(message: Message, subscription: MessageFilter['subscription']): boolean {
  return subscription === undefined || isThrough(message, subscription);
}

/** What the words are looked for in: the channel and the message as `value.format` gives it (rules 1 and 2). */
function messageTexts(message: Message): readonly string[] {
  return [nameText(message.channel), searchedText(message.message)];
}

/** For an event, also its operation, its collection, its document and its fields (rule 3). */
function eventTexts(row: EventRow): readonly string[] {
  const first = row.messages[0];
  return [
    ...row.messages.map((each) => nameText(each.channel)),
    ...(first === undefined ? [] : [searchedText(first.message)]),
    row.event.operation,
    row.event.collection,
    row.event.document,
    ...(row.event.fields ?? []),
  ];
}

function holdsEvery(texts: readonly string[], words: readonly string[]): boolean {
  const lower = texts.map((each) => each.toLowerCase());
  return words.every((word) => lower.some((each) => each.includes(word)));
}

function isShown(row: Row, words: readonly string[], subscription: MessageFilter['subscription']): boolean {
  switch (row.kind) {
    case 'gap':
      return true;
    case 'message':
      return arrivedThrough(row, subscription) && holdsEvery(messageTexts(row), words);
    case 'event':
      return row.messages.some((each) => arrivedThrough(each, subscription)) && holdsEvery(eventTexts(row), words);
  }
}

/** Feature: pubsub.filter — the rows shown, in the same order. */
export function shownMessages(messages: readonly Row[], filter: MessageFilter): readonly Row[] {
  if (!isFiltering(filter)) {
    return messages;
  }
  const words = wordsOf(filter.text);
  return messages.filter((row) => isShown(row, words, filter.subscription));
}

/** How many rows are messages or events, not gaps. */
export function messageCount(rows: readonly Row[]): number {
  return rows.reduce((count, row) => (row.kind === 'gap' ? count : count + 1), 0);
}

/** The line of the counts (rule 6): *37 of 1,204 messages* while a filter is on, *1,204 messages* without. */
export function countsText(shown: number, all: number, filtering: boolean): string {
  return filtering ? `${groupThousands(shown)} of ${messagesText(all)}` : messagesText(all);
}
