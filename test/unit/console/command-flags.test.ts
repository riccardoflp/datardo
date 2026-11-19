import { describe, expect, it } from 'vitest';
import { parse, request } from '../../../src/features/console/command-flags';
import type { CommandFlags } from '../../../src/features/console/types';
import type { RedisReply } from '../../../src/shared/engine-request';
import { cacheLocal, consoleContext, consoleState, recordedReply } from './context';

const info = (name: string): RedisReply => recordedReply('redis-7.4-command-info', name);

function flagsOf(result: CommandFlags): readonly string[] {
  return result.kind === 'told' ? result.flags : [result.kind];
}

const encoder = new TextEncoder();
const text = (value: string): Uint8Array => encoder.encode(value);

/** `COMMAND INFO set` as Redis 6.2 answers it: seven elements, no subcommands. */
const set62: RedisReply = [
  [text('set'), -3, [text('write'), text('denyoom')], 1, 1, 1, [text('@write'), text('@string'), text('@slow')]],
];

describe('console.command-flags', () => {
  it("asks COMMAND INFO with the name in lower case, on the console's own connection", () => {
    const context = consoleContext('console.command-flags', consoleState());
    const asked = request(context, { connection: cacheLocal.id, name: 'SET' });
    expect(asked).toMatchObject({ kind: 'engine', requests: [{ connection: 'c-cache#console' }] });
    const command =
      asked.kind === 'engine'
        ? (asked.requests[0]?.request as { readonly command: readonly Uint8Array[] }).command
        : [];
    expect(command.map((word) => new TextDecoder().decode(word))).toEqual(['COMMAND', 'INFO', 'set']);
  });

  it('gives SET a set of flags that holds write, on Redis 6.2 and on Redis 7.4', () => {
    expect(flagsOf(parse([info('set')], { name: 'set' }))).toContain('write');
    expect(flagsOf(parse([set62], { name: 'set' }))).toContain('write');
  });

  it('gives GET a set that holds readonly and not write', () => {
    const flags = flagsOf(parse([info('get')], { name: 'get' }));
    expect(flags).toContain('readonly');
    expect(flags).not.toContain('write');
  });

  it('gives FUNCTION FLUSH the flags of function|flush, and FUNCTION LIST those of function|list', () => {
    expect(flagsOf(parse([info('function')], { name: 'function', subcommand: 'FLUSH' }))).toContain('write');
    expect(flagsOf(parse([info('function')], { name: 'function', subcommand: 'list' }))).not.toContain('write');
  });

  it('gives a command the server does not know unknown', () => {
    expect(parse([info('mymodule.do')], { name: 'mymodule.do' })).toEqual({ kind: 'unknown' });
  });

  it('gives a user whose ACL denies COMMAND not told', () => {
    expect(parse([recordedReply('redis-7.4-command-info-denied')], { name: 'set' })).toEqual({ kind: 'not-told' });
    expect(parse([{ kind: 'error', message: "ERR unknown command 'COMMAND'" }], { name: 'set' })).toEqual({
      kind: 'not-told',
    });
  });
});
