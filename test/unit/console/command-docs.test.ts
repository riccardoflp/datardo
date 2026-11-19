import { describe, expect, it } from 'vitest';
import { syntaxLine } from '../../../src/features/console/argument-hint';
import { builtinCommands, commandDoc, parse, request } from '../../../src/features/console/command-docs';
import type { RedisReply } from '../../../src/shared/engine-request';
import { cacheLocal, consoleContext, consoleState, recordedReply } from './context';

const docs = recordedReply('redis-7.4-command-docs');

function names(commands: readonly { readonly name: string }[]): readonly string[] {
  return commands.map((command) => command.name);
}

describe('console.command-docs', () => {
  it('on Redis 7.2 asks COMMAND DOCS on the ordinary client, and offers the names it answered', () => {
    const asked = request(consoleContext('console.command-docs', consoleState()), { connection: cacheLocal.id });
    expect(asked).toMatchObject({ kind: 'engine', requests: [{ connection: 'c-cache' }] });
    const result = parse([docs], { version: '7.2.4' });
    expect(result.source).toBe('server');
    expect([...names(result.commands)].sort()).toEqual(
      ['blpop', 'config', 'del', 'expire', 'get', 'hset', 'scan', 'set', 'sort', 'substr', 'zadd'].sort(),
    );
  });

  it("offers a module's commands like the others", () => {
    const withModule: RedisReply = {
      kind: 'map',
      entries: [
        [
          new TextEncoder().encode('mymodule.do'),
          { kind: 'map', entries: [[new TextEncoder().encode('summary'), new TextEncoder().encode('Does it.')]] },
        ],
      ],
    };
    expect(names(parse([withModule]).commands)).toEqual(['mymodule.do']);
  });

  it('reads the arguments, the subcommands and what is deprecated', () => {
    const commands = parse([docs]).commands;
    const set = commandDoc(commands, 'SET', undefined);
    expect(set?.arguments.map((argument) => argument.name)).toEqual(['key', 'value', 'condition', 'get', 'expiration']);
    expect(commandDoc(commands, 'config', 'set')?.name).toBe('config|set');
    expect(commandDoc(commands, 'substr', undefined)?.deprecated).toEqual({ since: '2.0.0', replacedBy: '`GETRANGE`' });
  });

  it('on Redis 6.2 sends no COMMAND DOCS and leaves out of the built-in list what came in 7.0', () => {
    const asked = request(consoleContext('console.command-docs', consoleState([], '6.2.14')), {
      connection: cacheLocal.id,
    });
    expect(asked).toEqual({ kind: 'engine', requests: [] });
    const result = parse([], { version: '6.2.14' });
    expect(result.source).toBe('built-in');
    for (const name of ['fcall', 'function', 'eval_ro', 'lmpop', 'sintercard']) {
      expect(names(result.commands)).not.toContain(name);
    }
    expect(names(result.commands)).toContain('getdel');
  });

  it('on Redis 6.2 hints SET with GET and EXAT, and EXPIRE without NX', () => {
    const commands = parse([], { version: '6.2.14' }).commands;
    const set = commandDoc(commands, 'set', undefined);
    const expire = commandDoc(commands, 'expire', undefined);
    expect(set === undefined ? '' : syntaxLine(set).syntax).toContain('[GET]');
    expect(set === undefined ? '' : syntaxLine(set).syntax).toContain('EXAT unix-time-seconds');
    expect(expire === undefined ? '' : syntaxLine(expire).syntax).toBe('EXPIRE key seconds');
  });

  it('gives a user whose ACL denies COMMAND the built-in list, and no error', () => {
    const result = parse([recordedReply('redis-7.4-command-info-denied')], { version: '7.2.4' });
    expect(result.source).toBe('built-in');
    expect(result.commands.length).toBe(builtinCommands.length);
  });

  it('completes from the built-in list while the reply has not arrived', () => {
    expect(parse([], null)).toEqual({ source: 'built-in', commands: builtinCommands });
    expect(names(builtinCommands)).toContain('getrange');
    expect(names(builtinCommands)).not.toContain('hexpire');
  });
});
