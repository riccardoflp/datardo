import { describe, expect, it } from 'vitest';
import { redisAddress } from '../../../src/engines/redis';
import { toRedisReply } from '../../../src/engines/redis/replies';
import { needsDatabase, selectedAtStart, sendInDatabase } from '../../../src/engines/redis/select';
import { redisCommand } from '../../../src/shared/engine-request';

const decoder = new TextDecoder();

/** Records the commands sent, as text, and answers each after a turn. */
function recorder(): { sent: string[]; send: (command: readonly Uint8Array[]) => Promise<unknown> } {
  const sent: string[] = [];
  return {
    sent,
    send: async (command) => {
      sent.push(command.map((word) => decoder.decode(word)).join(' '));
      await Promise.resolve();
      return 'OK';
    },
  };
}

describe('the Redis engine', () => {
  it('reads the address of a connection string, its password decoded', () => {
    expect(redisAddress('rediss://ada:p%40ss@cache:6390/3')).toEqual({
      host: 'cache',
      port: 6390,
      username: 'ada',
      password: 'p@ss',
      database: 3,
      tls: true,
    });
    expect(redisAddress('redis://[::1]')).toMatchObject({ host: '::1', port: 6379, database: 0, tls: false });
  });

  it('says nothing of the string when it cannot be read', () => {
    expect(() => redisAddress('redis://:secret@ho st:x')).toThrow('Invalid Redis connection string');
  });

  it('sends SELECT before a command of another database, and only then', async () => {
    const { sent, send } = recorder();
    const selected = selectedAtStart();
    await sendInDatabase(selected, redisCommand(0, 'GET', 'a'), send);
    await sendInDatabase(selected, redisCommand(3, 'GET', 'b'), send);
    await sendInDatabase(selected, redisCommand(3, 'GET', 'c'), send);
    await sendInDatabase(selected, redisCommand(5, 'INFO', 'server'), send);
    expect(sent).toEqual(['GET a', 'SELECT 3', 'GET b', 'GET c', 'INFO server']);
  });

  it('never runs a command in a database it did not name, when requests overlap', async () => {
    const { sent, send } = recorder();
    const selected = selectedAtStart();
    await Promise.all([
      sendInDatabase(selected, redisCommand(1, 'SET', 'a', '1'), send),
      sendInDatabase(selected, redisCommand(0, 'SET', 'b', '2'), send),
      sendInDatabase(selected, redisCommand(1, 'SET', 'c', '3'), send),
    ]);
    expect(sent).toEqual(['SELECT 1', 'SET a 1', 'SELECT 0', 'SET b 2', 'SELECT 1', 'SET c 3']);
  });

  it('refuses KEYS (R9.3)', async () => {
    const { sent, send } = recorder();
    await expect(sendInDatabase(selectedAtStart(), redisCommand(0, 'keys', '*'), send)).rejects.toThrow(
      /never sends KEYS/,
    );
    expect(sent).toEqual([]);
    expect(needsDatabase(redisCommand(0, 'PING'))).toBe(false);
    expect(needsDatabase(redisCommand(0, 'SCAN', '0'))).toBe(true);
  });

  it('gives replies back with strings as bytes and maps as entries', () => {
    const bytes = Buffer.from([0xff, 0x00, 0x41]);
    const reply = toRedisReply([bytes, 3, null, new Map([[Buffer.from('k'), Buffer.from('v')]]), new Error('ERR x')]);
    expect(reply).toEqual([
      Uint8Array.from([0xff, 0x00, 0x41]),
      3,
      null,
      { kind: 'map', entries: [[Uint8Array.from([0x6b]), Uint8Array.from([0x76])]] },
      { kind: 'error', message: 'ERR x' },
    ]);
  });
});
