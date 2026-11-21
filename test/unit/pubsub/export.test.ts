import { describe, expect, it } from 'vitest';
import { exportedText, exportFileName, plan } from '../../../src/features/pubsub/export';
import { reconnectedPage } from '../../../src/features/pubsub/reconnect';
import type { PubSubPage } from '../../../src/features/pubsub/types';
import type { Answers, FileStep } from '../../../src/shared/feature';
import { arrived, keptWith, now, offset, pageOf, planOf, pubsubContext, pubsubState } from './context';

/** The records of a CSV file, read as RFC 4180 says. */
function csvRecords(file: string): readonly (readonly string[])[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < file.length; index += 1) {
    const character = file[index] ?? '';
    if (quoted) {
      if (character === '"' && file[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      record.push(field);
      field = '';
    } else if (character === '\r' && file[index + 1] === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      index += 1;
    } else {
      field += character;
    }
  }
  return records;
}

function exportOf(page: PubSubPage, answers: Answers): ReturnType<typeof plan> {
  return plan(pubsubContext('pubsub.export', pubsubState([page])), answers);
}

const two = keptWith([arrived('orders:1', 'hello', now, 'orders:*'), arrived('orders', '{"status":"paid"}', now + 1)]);

describe('pubsub.export', () => {
  it('writes two lines for two messages as JSON Lines, the older first, each an object that parses', () => {
    const lines = exportedText(two.listed, 'jsonl', offset).trimEnd().split('\n');
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { time: '2025-11-17T17:20:00.000Z', channel: 'orders:1', pattern: 'orders:*', message: 'hello' },
      { time: '2025-11-17T17:20:00.001Z', channel: 'orders', message: '{"status":"paid"}' },
    ]);
  });

  it('writes the message {"status":"paid"} as a string, as it arrived', () => {
    expect(exportedText(two.listed, 'jsonl', offset)).toContain('"message":"{\\"status\\":\\"paid\\"}"');
  });

  it('writes the bytes 00 FF 41 with "messageHex":"00ff41" and no message, and in CSV as 0x00ff41', () => {
    const binary = keptWith([arrived('orders', Uint8Array.of(0x00, 0xff, 0x41))]).listed;
    const line = exportedText(binary, 'jsonl', offset);
    expect(line).toContain('"messageHex":"00ff41"');
    expect(line).not.toContain('"message":');
    expect(csvRecords(exportedText(binary, 'csv', offset))[1]).toEqual([
      '2025-11-17T17:20:00.000Z',
      'orders',
      '',
      '0x00ff41',
    ]);
    const channel = keptWith([arrived('x', 'y')]).listed.map((row) => ({ ...row, channel: Uint8Array.of(0xff) }));
    expect(exportedText(channel, 'jsonl', offset)).toContain('"channelHex":"ff"');
  });

  it('writes a message with a comma, a quote and a line break as one record of the CSV file, read back whole', () => {
    const awkward = 'a, "b"\nc';
    const records = csvRecords(exportedText(keptWith([arrived('orders', awkward)]).listed, 'csv', offset));
    expect(records).toEqual([
      ['time', 'channel', 'pattern', 'message'],
      ['2025-11-17T17:20:00.000Z', 'orders', '', awkward],
    ]);
  });

  it('writes one array of the same objects as JSON', () => {
    expect(JSON.parse(exportedText(two.listed, 'json', offset))).toHaveLength(2);
  });

  it('offers The 37 shown by the filter and All 1,204, the first chosen, with a filter and none selected', () => {
    const messages = Array.from({ length: 1204 }, (_, index) =>
      arrived('orders', index < 37 ? `paid ${String(index)}` : `new ${String(index)}`, now + index),
    );
    const page = pageOf({ kept: keptWith(messages), filter: { text: 'paid' } });
    const asked = exportOf(page, {});
    const field = asked.kind === 'ask' ? asked.question.fields[0] : undefined;
    expect(field?.kind === 'pick-one' ? [field.choices.map((each) => each.label), field.default] : []).toEqual([
      ['The 37 shown by the filter', 'All 1,204'],
      'shown',
    ]);
  });

  it('asks the system’s file dialog for the file, named pubsub-cache-local-20251117-182000.jsonl, and writes it', () => {
    const page = pageOf({ kept: two, selected: [2] });
    const asked = exportOf(page, { messages: 'selected', format: 'jsonl' });
    expect(asked).toEqual({
      kind: 'read',
      need: { key: 'file', read: 'pubsub.export:file', args: { name: 'pubsub-cache-local-20251117-182000.jsonl' } },
    });
    const file = 'C:\\Users\\ada\\Documents\\pubsub-cache-local-20251117-182000.jsonl';
    const planned = planOf(exportOf(page, { messages: 'selected', format: 'jsonl', file }));
    expect(planned.title).toBe('Export 1 message');
    expect(planned.steps[0]?.text).toBe(`write ${file}`);
    expect((planned.steps[0] as FileStep).content?.args).toEqual({ connection: 'c-cache', format: 'jsonl', rows: [2] });
    expect(planned.after).toEqual([
      { kind: 'notify', level: 'success', text: 'Exported 1 message to pubsub-cache-local-20251117-182000.jsonl.' },
    ]);
    expect(exportFileName('Cache local', now, offset, 'csv')).toBe('pubsub-cache-local-20251117-182000.csv');
  });

  it('writes no file until the form and the file dialog are answered, and none when either is cancelled', () => {
    expect(exportOf(pageOf({ kept: two }), {}).kind).toBe('ask');
    expect(exportOf(pageOf({ kept: two }), { messages: 'all', format: 'csv' }).kind).toBe('read');
    const cancelled = planOf(exportOf(pageOf({ kept: two }), { messages: 'all', format: 'csv', file: null }));
    expect(cancelled.steps).toEqual([]);
    expect(cancelled.after).toEqual([]);
  });

  it('offers the rows the window has selected and shows, given with the intent', () => {
    const page = pageOf({ kept: two });
    const asked = exportOf(page, { args: { selected: [1], filter: { text: 'paid' } } });
    const choices = asked.kind === 'ask' ? asked.question.fields[0] : undefined;
    expect(choices?.kind === 'pick-one' ? choices.choices.map((each) => each.label) : []).toEqual([
      'The 1 selected',
      'The 1 shown by the filter',
      'All 2',
    ]);
  });

  it('refuses an empty list with pubsub.export/empty', () => {
    expect(exportOf(pageOf(), {})).toEqual(expect.objectContaining({ kind: 'refuse', code: 'pubsub.export/empty' }));
  });

  it('writes the row of a gap as a record with "gap":true and its two times', () => {
    const page = reconnectedPage(pageOf({ pageConnection: 'disconnected', disconnectedAt: now }), now + 3000);
    expect(exportedText(page.kept.listed, 'jsonl', offset)).toBe(
      '{"gap":true,"from":"2025-11-17T17:20:00.000Z","to":"2025-11-17T17:20:03.000Z"}\n',
    );
  });
});
