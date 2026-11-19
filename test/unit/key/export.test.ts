import { describe, expect, it } from 'vitest';
import type { ExportedKey } from '../../../src/features/key/export-text';
import { exportFileText, exportText } from '../../../src/features/key/export-text';
import type { ValueReading } from '../../../src/features/key/export';
import {
  afterValueReply,
  dumpInstead,
  expiresAtOfReply,
  exportedText,
  headCommands,
  nextValueCommand,
  plan,
  startReading,
} from '../../../src/features/key/export';
import { importedKeys } from '../../../src/features/key/import-parse';
import { hexOf } from '../../../src/features/key/types';
import { cache, cacheReadOnly, connected, keyContext, name, onDatabase, planOf, recordedReplies } from './context';
import { exampleFile } from './example';

const context = keyContext('key.export', onDatabase());
const words = (command: readonly (string | Uint8Array)[] | undefined): string =>
  (command ?? []).map((word) => (typeof word === 'string' ? word : new TextDecoder().decode(word))).join(' ');

/** Reads a key from the replies recorded for it, as the writer of the main process does; the commands it sent. */
function replayed(key: string, type: string): { reading: ValueReading; commands: string[] } {
  let reading = startReading(name(key), type);
  const commands: string[] = [];
  for (const reply of recordedReplies(`export-${key}`)) {
    commands.push(words(nextValueCommand(reading)));
    reading = afterValueReply(reading, reply);
    reading = dumpInstead(reading) ?? reading;
  }
  expect(nextValueCommand(reading)).toBeUndefined();
  return { reading, commands };
}

describe('key.export', () => {
  it('writes the selected keys session:1 and user:7 in the order of the table, from the replies of Redis 7.4', () => {
    const outcome = plan(context, { args: { keys: [hexOf(name('session:1')), hexOf(name('user:7'))] } });
    expect(outcome).toEqual({
      kind: 'read',
      need: { key: 'file', read: 'key.export:file', args: { mode: 'save', name: 'cache-local-db0.redis' } },
    });
    const written = planOf(
      plan(context, {
        args: { keys: [hexOf(name('session:1')), hexOf(name('user:7'))] },
        file: 'C:\\exports\\a.redis',
      }),
    );
    expect(written.steps).toEqual([
      {
        kind: 'file',
        action: 'write',
        path: 'C:\\exports\\a.redis',
        content: {
          writer: 'key.export',
          args: {
            connection: cache.id,
            database: 0,
            keys: [hexOf(name('session:1')), hexOf(name('user:7'))],
            redisVersion: '7.4.1',
          },
        },
        text: expect.stringContaining('C:\\exports\\a.redis') as string,
      },
    ]);
    const [expiry] = recordedReplies('pexpiretime');
    const session: ExportedKey = {
      name: name('session:1'),
      value: replayed('session:1', 'string').reading.value,
      expiresAt: expiresAtOfReply(expiry ?? null, '7.4.1', 0) as number,
    };
    const user: ExportedKey = { name: name('user:7'), value: replayed('user:7', 'hash').reading.value };
    expect(exportFileText([session, user])).toBe(`${exampleFile.split('\n').slice(0, 3).join('\n')}\n`);
  });

  it('reads the list, the sorted set and the stream of the example as Redis 7.4 gave them', () => {
    const lines = [
      ['queue:mail', 'list'],
      ['board', 'zset'],
      ['events', 'stream'],
    ].flatMap(([key = '', type = '']) => exportText({ name: name(key), value: replayed(key, type).reading.value }));
    expect(lines).toEqual([
      'RPUSH queue:mail a "c d" "\\x00\\xff"',
      'ZADD board 1.5 ada 3 bob inf zed',
      'XADD events 1700000000000-0 type signup user 7',
    ]);
    expect(replayed('board', 'zset').commands).toEqual(['ZRANGE board 0 499 WITHSCORES']);
    expect(replayed('user:7', 'hash').commands).toEqual(['HSCAN user:7 0 COUNT 500']);
  });

  it('scans to the end a pattern before the first key is read', () => {
    const outcome = plan(context, { args: { pattern: 'orders:*', type: 'all' } });
    expect(outcome).toEqual({
      kind: 'read',
      need: {
        key: 'found',
        read: 'key.export:scan',
        args: { connection: cache.id, database: 0, pattern: 'orders:*', type: 'all', keepAtMost: null },
      },
    });
    expect(plan(context, { args: { pattern: 'orders:*' }, found: { found: 0, total: 9 } })).toEqual({
      kind: 'refuse',
      code: 'key.export/nothing',
      message: 'No keys match `orders:*`: nothing to export.',
    });
  });

  it('asks what to export when keys are selected and the tab has a pattern', () => {
    const outcome = plan(context, { args: { keys: [hexOf(name('a'))], pattern: 'orders:*', type: 'hash' } });
    expect(outcome).toMatchObject({
      kind: 'ask',
      question: {
        fields: [
          {
            key: 'what',
            default: 'selected',
            choices: [{ label: 'The 1 selected key' }, { label: 'Every key of type Hash matching `orders:*`' }],
          },
        ],
      },
    });
  });

  it('reads the expiry with PEXPIRETIME on Redis 7.2, and with PTTL on 6.2', () => {
    expect(headCommands(name('a'), '7.2.4').map(words)).toEqual(['TYPE a', 'PEXPIRETIME a']);
    expect(headCommands(name('a'), '6.2.14').map(words)).toEqual(['TYPE a', 'PTTL a']);
    expect(expiresAtOfReply(7_500_000, '6.2.14', 1000)).toBe(7_501_000);
    expect(expiresAtOfReply(-1, '7.2.4', 1000)).toBeUndefined();
    expect(expiresAtOfReply(-2, '7.2.4', 1000)).toBe('gone');
  });

  it('reads a string of 3 MB with three GETRANGE of 1,048,576 bytes', () => {
    let reading = startReading(name('big'), 'string');
    const sent: string[] = [words(nextValueCommand(reading))];
    reading = afterValueReply(reading, 3 * 1_048_576);
    for (let next = nextValueCommand(reading); next !== undefined; next = nextValueCommand(reading)) {
      sent.push(words(next));
      reading = afterValueReply(reading, new Uint8Array(1_048_576));
    }
    expect(sent).toEqual([
      'STRLEN big',
      'GETRANGE big 0 1048575',
      'GETRANGE big 1048576 2097151',
      'GETRANGE big 2097152 3145727',
    ]);
  });

  it('writes a key of the type ReJSON-RL, and a stream without entries, as a RESTORE line', () => {
    const module = startReading(name('doc'), 'ReJSON-RL');
    expect(words(nextValueCommand(module))).toBe('DUMP doc');
    const empty = replayed('empty-stream', 'stream');
    expect(empty.commands).toEqual(['XRANGE empty-stream - + COUNT 500', 'DUMP empty-stream']);
    const [line] = exportText({ name: name('empty-stream'), value: empty.reading.value });
    expect(line).toMatch(/^RESTORE empty-stream 0 "/u);
  });

  it('says what it exported, and how many were gone', () => {
    expect(exportedText(1832, 1832, 'C:\\exports\\cache-local-db0.redis')).toBe(
      'Exported 1,832 keys to C:\\exports\\cache-local-db0.redis.',
    );
    expect(exportedText(1830, 1832, 'C:\\exports\\cache-local-db0.redis')).toBe(
      'Exported 1,830 of 1,832 keys to C:\\exports\\cache-local-db0.redis: the others were already gone.',
    );
  });

  it('runs on a read-only connection: it writes nothing to a deployment', () => {
    const readOnly = keyContext('key.export', onDatabase(0, cacheReadOnly), connected(cacheReadOnly));
    const written = planOf(plan(readOnly, { args: { keys: [hexOf(name('a'))] }, file: 'C:\\a.redis' }));
    expect(written.steps.map((step) => step.kind)).toEqual(['file']);
    expect(written.undo).toEqual({ cannot: 'Cannot be undone: it writes a file, which the user can delete.' });
  });

  it('writes a file that key.import reads back with the same types, bytes and dates of expiry', () => {
    const value = replayed('queue:mail', 'list').reading.value;
    const file = exportFileText([{ name: name('queue:mail'), value, expiresAt: 1_798_761_600_000 }]);
    const parsed = importedKeys(file);
    expect(parsed).toMatchObject({ kind: 'keys', keys: [{ name: name('queue:mail'), type: 'list' }] });
    const commands = parsed.kind === 'keys' ? (parsed.keys[0]?.commands ?? []) : [];
    expect(commands.map((command) => command.words.slice(2))).toEqual([
      [name('a'), name('c d'), Uint8Array.of(0, 0xff)],
      [name('1798761600000')],
    ]);
  });
});
