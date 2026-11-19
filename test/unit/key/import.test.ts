import { describe, expect, it } from 'vitest';
import { existsRead, failedText, plan } from '../../../src/features/key/import';
import { hexOf } from '../../../src/features/key/types';
import type { ReadRequest } from '../../../src/shared/feature';
import {
  cache,
  cacheReadOnly,
  commandsOf,
  connected,
  keyContext,
  name,
  onDatabase,
  planOf,
  recordedReplies,
  requestWords,
} from './context';
import { exampleFile } from './example';

const context = keyContext('key.import', onDatabase());
const file = { path: 'C:\\exports\\cache-local-db0.redis', name: 'cache-local-db0.redis', text: `${exampleFile}\n` };
const exampleNames = ['session:1', 'user:7', 'queue:mail', 'board', 'events'];
const noneExists = [false, false, false, false, false];
const userExists = [false, true, false, false, false];

describe('key.import', () => {
  it('asks Import 5 keys from … into db0 of Cache local? and sends the six lines of the example', () => {
    expect(plan(context, {})).toEqual({
      kind: 'read',
      need: { key: 'file', read: 'key.import:file', args: { mode: 'open' } },
    });
    expect(plan(context, { file })).toMatchObject({ kind: 'ask', question: { title: 'When a key already exists' } });
    expect(plan(context, { file, existing: 'skip' })).toEqual({
      kind: 'read',
      need: {
        key: 'exists',
        read: 'key.import:exists',
        args: { connection: cache.id, database: 0, keys: exampleNames.map((each) => hexOf(name(each))) },
      },
    });
    const imported = plan(context, { file, existing: 'skip', exists: noneExists });
    expect(planOf(imported).danger).toEqual({
      kind: 'confirm',
      text: 'Import 5 keys from cache-local-db0.redis into db0 of Cache local?\n5 are new. It can be undone from the Undo history.',
      button: 'Import',
    });
    expect(planOf(imported).steps.map((step) => step.text)).toEqual(exampleFile.split('\n'));
  });

  it('reads EXISTS of each key, and what the server answered', () => {
    const asked = existsRead.request(context, { connection: cache.id, database: 0, keys: [hexOf(name('orders:42'))] });
    expect((asked as Extract<ReadRequest, { kind: 'engine' }>).requests.map(requestWords)).toEqual([
      'EXISTS orders:42',
    ]);
    expect(existsRead.parse([...recordedReplies('exists-taken'), ...recordedReplies('exists-free')], null)).toEqual([
      true,
      false,
    ]);
  });

  it('skips user:7 when it exists and Skip it is chosen, and says 1 skipped', () => {
    const imported = planOf(plan(context, { file, existing: 'skip', exists: userExists }));
    expect(imported.steps.some((step) => step.text.includes('user:7'))).toBe(false);
    expect(imported.after[0]).toMatchObject({ text: 'Imported 4 keys into db0; 1 skipped because they exist.' });
  });

  it('sends UNLINK user:7 before HSET user:7 … with Replace it', () => {
    const steps = commandsOf(plan(context, { file, existing: 'replace', exists: userExists }));
    expect(steps.indexOf('UNLINK user:7')).toBeGreaterThanOrEqual(0);
    expect(steps.indexOf('UNLINK user:7') + 1).toBe(steps.indexOf('HSET user:7 name Ada Lovelace visits 12'));
  });

  it('sends nothing with Stop, and says Nothing imported: the key user:7 already exists in db0.', () => {
    expect(plan(context, { file, existing: 'stop', exists: userExists })).toEqual({
      kind: 'refuse',
      code: 'key.import/exists',
      message: 'Nothing imported: the key user:7 already exists in db0.',
    });
  });

  it('refuses a file with the line FLUSHALL before anything is sent', () => {
    const bad = { ...file, text: 'SET a 1\nFLUSHALL\n' };
    expect(plan(context, { file: bad })).toMatchObject({
      kind: 'refuse',
      code: 'key.import/invalid-file',
      message: expect.stringMatching(/^Line 2: .*found FLUSHALL\.$/u) as string,
    });
    expect(plan(context, { file: { ...file, text: '# nothing\n' } })).toEqual({
      kind: 'refuse',
      code: 'key.import/empty',
      message: 'The file has no keys.',
    });
  });

  it('keeps the keys it imports for the undo, so the undo deletes those created and puts back those replaced', () => {
    const imported = planOf(plan(context, { file, existing: 'replace', exists: userExists }));
    expect(imported.undo).toEqual({
      keeps: { engine: 'redis', database: 0, keys: exampleNames.map((each) => hexOf(name(each))) },
    });
  });

  it('cannot be undone with 12,000 new keys', () => {
    const many = Array.from({ length: 12_000 }, (_, index) => `SET k${String(index)} v`).join('\n');
    const imported = planOf(
      plan(context, { file: { ...file, text: many }, existing: 'skip', exists: Array<boolean>(12_000).fill(false) }),
    );
    expect(imported.danger).toMatchObject({
      text: expect.stringContaining(
        "This can't be undone: the undo history keeps operations of up to 10,000 keys.",
      ) as string,
    });
  });

  it('unlinks the key of a line the server refuses, so the keys before it stay and that key does not', () => {
    const steps = planOf(plan(context, { file, existing: 'skip', exists: noneExists })).steps;
    const hset = steps.find((step) => step.text.startsWith('HSET user:7'));
    expect(hset?.onFailure).toMatchObject({ kind: 'instead', steps: [{ text: 'UNLINK user:7' }] });
    expect(failedText(40, 1832, 212, 'ERR DUMP payload version or checksum are wrong')).toBe(
      'Imported 40 of 1,832 keys, then at line 212: ERR DUMP payload version or checksum are wrong: this key was exported from a newer or a different server.',
    );
  });

  it('asks the number of keys replaced to be typed when they cannot be put back', () => {
    const many = Array.from({ length: 10_001 }, (_, index) => `SET k${String(index)} v`).join('\n');
    const exists = Array<boolean>(10_001).fill(false);
    exists[0] = true;
    const imported = planOf(plan(context, { file: { ...file, text: many }, existing: 'replace', exists }));
    expect(imported.danger).toMatchObject({ kind: 'destructive', name: '1' });
  });

  it('has no Import keys… on a read-only connection, and refuses there', () => {
    const readOnly = keyContext('key.import', onDatabase(0, cacheReadOnly), connected(cacheReadOnly));
    expect(plan(readOnly, {})).toMatchObject({ code: 'key.import/read-only' });
  });
});
