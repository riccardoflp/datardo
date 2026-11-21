/**
 * Feature: pubsub.export
 *
 * Writes the messages of the list to a file, as JSON Lines, JSON or CSV, the oldest first, in UTF-8: the selected
 * rows, those the filter shows, or all of them. Bytes survive: a channel, a pattern or a message that is not valid
 * UTF-8 is written in hexadecimal. The plan names the rows when it is made, so that messages that arrive while the
 * file is written are not in it; the main process writes them with {@link exportedText}.
 */
import type { Json } from '../../shared/engine-request';
import type { Answers, Context, Outcome, ReadFeature } from '../../shared/feature';
import { ask, needRead, noDanger, refuse, run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { Question } from '../../shared/question';
import { savedConnection } from '../../shared/state/connections';
import { isFiltering, messageCount, shownMessages } from './filter';
import { gapText } from './reconnect';
import { text } from './text';
import type { Gap, Message, MessageFilter, PubSubPage, Row } from './types';
import {
  hexOf,
  localTime,
  messagesOf,
  namedSubscription,
  pageConnectionOf,
  pubsubPageOf,
  rowsNumbered,
  startArgs,
  textOf,
} from './types';

/** The formats of the file. */
export type ExportFormat = 'jsonl' | 'json' | 'csv';

/** Which rows are written. */
export type ExportedRows = 'selected' | 'shown' | 'all';

/** The extension of each format. */
export const extensions: Readonly<Record<ExportFormat, string>> = { jsonl: '.jsonl', json: '.json', csv: '.csv' };

/** The identifier of the read of the file, with the system's file dialog. */
export const fileReadId = 'pubsub.export:file';

/** The writer of the main process that writes the rows a plan names (`FileStep.content`). */
export const messagesWriter = 'pubsub.messages';

function isoTime(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

/** A text field of a record, or its hexadecimal twin when the bytes are not valid UTF-8: `channelHex`, `messageHex`. */
function bytesField(name: string, bytes: Uint8Array): Readonly<Record<string, string>> {
  const decoded = textOf(bytes);
  return decoded === undefined ? { [`${name}Hex`]: hexOf(bytes) } : { [name]: decoded };
}

/** One record, as a line of JSON Lines writes it: `time`, `channel`, `pattern` when it came through one, `message`. */
export function messageRecord(row: Message | Gap): Json {
  if (row.kind === 'gap') {
    return { gap: true, from: isoTime(row.from), to: isoTime(row.to) };
  }
  return {
    time: isoTime(row.receivedAt),
    ...bytesField('channel', row.channel),
    ...(row.pattern === undefined ? {} : bytesField('pattern', row.pattern)),
    ...bytesField('message', row.message),
  };
}

/** A field of CSV as RFC 4180 says: in double quotes, with its quotes doubled, when it holds `,`, `"` or a line break. */
function csvField(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

function csvBytes(bytes: Uint8Array | undefined): string {
  if (bytes === undefined) {
    return '';
  }
  return textOf(bytes) ?? `0x${hexOf(bytes)}`;
}

function csvLine(row: Message | Gap, offsetMinutes: number): string {
  const fields =
    row.kind === 'gap'
      ? [isoTime(row.from), '', '', gapText(row, offsetMinutes)]
      : [isoTime(row.receivedAt), csvBytes(row.channel), csvBytes(row.pattern), csvBytes(row.message)];
  return fields.map(csvField).join(',');
}

/** What the file holds: one record per message of the rows, the oldest first; with an event, each of its messages. */
export function exportedText(rows: readonly Row[], format: ExportFormat, offsetMinutes: number): string {
  const messages = messagesOf(rows);
  switch (format) {
    case 'jsonl':
      return messages.map((each) => `${JSON.stringify(messageRecord(each))}\n`).join('');
    case 'json':
      return messages.length === 0
        ? '[]\n'
        : `[\n${messages.map((each) => `  ${JSON.stringify(messageRecord(each))}`).join(',\n')}\n]\n`;
    case 'csv':
      return ['time,channel,pattern,message', ...messages.map((each) => csvLine(each, offsetMinutes))]
        .map((line) => `${line}\r\n`)
        .join('');
  }
}

/** The name the file dialog proposes: `pubsub-cache-local-20261117-140509`, then the extension of the format. */
export function exportFileName(connection: string, now: number, offsetMinutes: number, format: ExportFormat): string {
  const name = Array.from(connection.toLowerCase(), (character) => (/[\p{L}\p{N}]/u.test(character) ? character : '-'));
  const time = localTime(now, offsetMinutes);
  const stamp = `${time.year}${time.month}${time.day}-${time.hours}${time.minutes}${time.seconds}`;
  return `pubsub-${name.join('')}-${stamp}${extensions[format]}`;
}

/** The rows each choice of **Messages** writes, and the choices that apply, the first being the default. */
export function rowChoices(
  page: PubSubPage,
): readonly { readonly value: ExportedRows; readonly rows: readonly Row[] }[] {
  const listed = page.kept.listed;
  const selected = rowsNumbered(listed, page.selected);
  return [
    ...(selected.length === 0 ? [] : [{ value: 'selected' as const, rows: selected }]),
    ...(isFiltering(page.filter) ? [{ value: 'shown' as const, rows: shownMessages(listed, page.filter) }] : []),
    { value: 'all' as const, rows: listed },
  ];
}

function choiceLabel(value: ExportedRows, rows: readonly Row[]): string {
  switch (value) {
    case 'selected':
      return text.export.selected(rows.length);
    case 'shown':
      return text.export.shown(messageCount(rows));
    case 'all':
      return text.export.all(messageCount(rows));
  }
}

/** The form: **Messages** with the choices that apply, and **Format**. */
export function exportQuestion(page: PubSubPage): Question {
  const choices = rowChoices(page);
  return {
    title: text.export.question,
    button: text.export.button,
    fields: [
      {
        kind: 'pick-one',
        key: 'messages',
        label: text.export.messages,
        default: choices[0]?.value ?? 'all',
        choices: choices.map((each) => ({ value: each.value, label: choiceLabel(each.value, each.rows) })),
      },
      {
        kind: 'pick-one',
        key: 'format',
        label: text.export.format,
        default: 'jsonl',
        choices: (['jsonl', 'json', 'csv'] as const).map((each) => ({ value: each, label: text.export.formats[each] })),
      },
    ],
  };
}

function formatOf(value: unknown): ExportFormat {
  return value === 'json' || value === 'csv' ? value : 'jsonl';
}

function baseName(path: string): string {
  return path.split(/[\\/]/u).pop() ?? path;
}

/**
 * The page as the window shows it: the rows selected and the filter live in the window, which starts the export with
 * them (`{ selected, filter }`); without them, those of the page.
 */
export function shownPage(page: PubSubPage, args: Readonly<Record<string, unknown>>): PubSubPage {
  const selected = args['selected'];
  const filter = args['filter'];
  const fields =
    typeof filter === 'object' && filter !== null ? (filter as Readonly<Record<string, unknown>>) : undefined;
  const marked = namedSubscription(fields?.['subscription']);
  const shownFilter: MessageFilter | undefined =
    fields === undefined
      ? undefined
      : {
          text: typeof fields['text'] === 'string' ? fields['text'] : '',
          ...(marked === undefined ? {} : { subscription: marked }),
        };
  return {
    ...page,
    ...(Array.isArray(selected) ? { selected: selected.filter((each) => typeof each === 'number') } : {}),
    ...(shownFilter === undefined ? {} : { filter: shownFilter }),
  };
}

/** Feature: pubsub.export — asks which messages and the format, then the file, and writes it. */
export function plan(context: Context, answers: Answers): Outcome {
  const id = pageConnectionOf(context);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  const kept = id === undefined ? undefined : pubsubPageOf(context.state, id);
  if (connection === undefined || kept === undefined || messageCount(kept.kept.listed) === 0) {
    return refuse('pubsub.export/empty', text.export.empty);
  }
  const page = shownPage(kept, startArgs(answers));
  if (answers['messages'] === undefined) {
    return ask(exportQuestion(page));
  }
  const format = formatOf(answers['format']);
  const file = answers['file'];
  if (file === undefined) {
    return needRead('file', fileReadId, {
      name: exportFileName(connection.name, context.now, page.offsetMinutes, format),
    });
  }
  const choices = rowChoices(page);
  const rows = (choices.find((each) => each.value === answers['messages']) ?? choices[choices.length - 1])?.rows ?? [];
  const messages = messagesOf(rows).filter((each) => each.kind === 'message').length;
  const chosen = typeof file === 'string' && file !== '';
  return run({
    title: text.export.title(messages),
    steps: chosen
      ? [
          {
            kind: 'file',
            text: `write ${file}`,
            action: 'write',
            path: file,
            content: {
              writer: messagesWriter,
              args: { connection: connection.id, format, rows: rows.map((r) => r.number) },
            },
          },
        ]
      : [],
    danger: noDanger,
    undo: { cannot: text.export.cannotUndo },
    publishes: false,
    after: chosen ? [{ kind: 'notify', level: 'success', text: text.export.exported(messages, baseName(file)) }] : [],
  });
}

/** `pubsub.export:file`: the system's save dialog, an app read that answers the path, or null when it was closed. */
export const fileRead: ReadFeature = {
  kind: 'read',
  id: featureId(fileReadId),
  request: (_context: Context, args: Json) => ({ kind: 'app', action: 'pubsub.choose-file', args }),
  parse: (replies) => (typeof replies[0] === 'string' ? replies[0] : null),
};
