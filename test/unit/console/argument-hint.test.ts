import { describe, expect, it } from 'vitest';
import { hintFor, syntaxLine } from '../../../src/features/console/argument-hint';
import { builtinCommands, builtinDocs, commandDoc } from '../../../src/features/console/command-docs';
import type { CommandDoc } from '../../../src/features/console/types';

function syntaxOf(name: string, subcommand?: string, docs: readonly CommandDoc[] = builtinCommands): string {
  const entry = commandDoc(docs, name, subcommand);
  return entry === undefined ? '' : syntaxLine(entry).syntax;
}

describe('console.argument-hint', () => {
  it('gives each example exactly its syntax, with the documentation of Redis 7.2', () => {
    expect(syntaxOf('get')).toBe('GET key');
    expect(syntaxOf('set')).toBe(
      'SET key value [NX | XX] [GET] [EX seconds | PX milliseconds | EXAT unix-time-seconds | PXAT unix-time-milliseconds | KEEPTTL]',
    );
    expect(syntaxOf('hset')).toBe('HSET key field value [field value ...]');
    expect(syntaxOf('del')).toBe('DEL key [key ...]');
    expect(syntaxOf('scan')).toBe('SCAN cursor [MATCH pattern] [COUNT count] [TYPE type]');
    expect(syntaxOf('zadd')).toBe('ZADD key [NX | XX] [GT | LT] [CH] [INCR] score member [score member ...]');
    expect(syntaxOf('config', 'set')).toBe('CONFIG SET parameter value [parameter value ...]');
    expect(syntaxOf('blpop')).toBe('BLPOP key [key ...] timeout');
    expect(syntaxOf('sort')).toContain('[GET pattern [GET pattern ...]]');
  });

  it('gives the summary and the version of GET', () => {
    const get = commandDoc(builtinCommands, 'get', undefined);
    expect(get === undefined ? undefined : syntaxLine(get)).toEqual({
      syntax: 'GET key',
      summary: 'Returns the string value of a key.',
      since: 'Since 1.0.0',
    });
  });

  it('shows the hint of SET for `set `, of CONFIG SET for `config set `, and none for `foo `', () => {
    expect(hintFor('set ', builtinCommands)?.syntax).toBe(syntaxOf('set'));
    expect(hintFor('set', builtinCommands)?.syntax).toBe(syntaxOf('set'));
    expect(hintFor('config set ', builtinCommands)?.syntax).toBe('CONFIG SET parameter value [parameter value ...]');
    expect(hintFor('config ', builtinCommands)?.syntax).toBe('CONFIG');
    expect(hintFor('foo ', builtinCommands)).toBeUndefined();
    expect(hintFor('ge', builtinCommands)).toBeUndefined();
  });

  it('on a Redis 6.2 server hints SET with GET and EXAT, and EXPIRE as `EXPIRE key seconds`', () => {
    const old = builtinDocs('6.2.14').commands;
    expect(syntaxOf('set', undefined, old)).toBe(
      'SET key value [NX | XX] [GET] [EX seconds | PX milliseconds | EXAT unix-time-seconds | PXAT unix-time-milliseconds | KEEPTTL]',
    );
    expect(syntaxOf('expire', undefined, old)).toBe('EXPIRE key seconds');
    expect(syntaxOf('expire')).toBe('EXPIRE key seconds [NX | XX | GT | LT]');
  });
});
