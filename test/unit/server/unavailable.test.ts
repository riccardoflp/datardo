import { describe, expect, it } from 'vitest';
import * as readClients from '../../../src/features/server/read-clients';
import * as readConfig from '../../../src/features/server/read-config';
import * as readInfo from '../../../src/features/server/read-info';
import * as readMemory from '../../../src/features/server/read-memory';
import * as readSlowLog from '../../../src/features/server/read-slow-log';
import { readsOf } from '../../../src/features/server/show';
import { isReadByAutoRefresh, partOf, unavailableSentence } from '../../../src/features/server/unavailable';
import { cacheLocal, failed, recordedBytes } from './context';

describe('server.unavailable', () => {
  const examples: readonly (readonly [string, string, string])[] = [
    [
      'CLIENT LIST',
      "NOPERM this user has no permissions to run the 'client' command or its subcommand",
      "CLIENT LIST needs a user that may run it: NOPERM this user has no permissions to run the 'client' command or its subcommand",
    ],
    [
      'CLIENT LIST',
      "NOPERM User app has no permissions to run the 'client|list' command",
      "CLIENT LIST needs a user that may run it: NOPERM User app has no permissions to run the 'client|list' command",
    ],
    [
      'CONFIG GET',
      "ERR unknown command 'CONFIG', with args beginning with: 'GET' '*'",
      "This server does not allow CONFIG GET: ERR unknown command 'CONFIG', with args beginning with: 'GET' '*'",
    ],
    [
      'MEMORY DOCTOR',
      "ERR Unknown subcommand or wrong number of arguments for 'DOCTOR'. Try MEMORY HELP.",
      "This server does not allow MEMORY DOCTOR: ERR Unknown subcommand or wrong number of arguments for 'DOCTOR'. Try MEMORY HELP.",
    ],
    [
      'INFO',
      'LOADING Redis is loading the dataset in memory',
      'The server is loading its data and does not answer INFO yet: LOADING Redis is loading the dataset in memory',
    ],
    ['SLOWLOG GET', 'ERR something else', 'ERR something else'],
  ];

  it.each(examples)('%s answered %s gives its sentence', (command, reply, sentence) => {
    expect(unavailableSentence(command, reply).sentence).toBe(sentence);
  });

  it('NOPERM is not allowed and not there are not tried again by themselves; LOADING and others are', () => {
    expect(unavailableSentence('CLIENT LIST', 'NOPERM no')).toMatchObject({ kind: 'not-allowed', retries: false });
    expect(unavailableSentence('CONFIG GET', 'ERR unknown command')).toMatchObject({
      kind: 'not-there',
      retries: false,
    });
    expect(unavailableSentence('INFO', 'LOADING wait')).toMatchObject({ kind: 'loading', retries: true });
    expect(unavailableSentence('SLOWLOG GET', 'ERR other')).toMatchObject({ kind: 'other', retries: true });
  });

  it('after a NOPERM for CLIENT LIST, the automatic refresh does not send it; Refresh and choosing the section do', () => {
    const last = { clients: partOf('CLIENT LIST', failed('NOPERM no'), () => []) };
    const input = { connection: cacheLocal.id, last };
    expect(isReadByAutoRefresh(last.clients)).toBe(false);
    expect(readsOf('clients', 'auto', input)).toEqual([]);
    expect(readsOf('clients', 'refresh', input).map((each) => each.read)).toEqual(['server.read-clients']);
    expect(readsOf('clients', 'chosen', input).map((each) => each.read)).toEqual(['server.read-clients']);
  });

  it('after a LOADING for INFO, the automatic refresh sends INFO again', () => {
    const last = { info: partOf('INFO', failed('LOADING Redis is loading the dataset in memory'), () => null) };
    expect(readsOf('overview', 'auto', { connection: cacheLocal.id, last }).map((each) => each.read)).toEqual([
      'server.read-info',
    ]);
  });

  it('a user allowed INFO and nothing else sees Overview and Replication whole, and the sentence in the four others', () => {
    const denied = (command: string) => failed(`NOPERM User app has no permissions to run the '${command}' command`);
    const overview = readInfo.parse([recordedBytes('redis-7.4-server-info.txt')]);
    const replication = readInfo.parse([recordedBytes('redis-7.4-server-info-replication.txt')]);
    expect(overview.kind).toBe('read');
    expect(replication.kind).toBe('read');
    const clients = readClients.parse([denied('client|list')]);
    const slowLog = readSlowLog.parse([denied('slowlog|get'), denied('slowlog|len')]).entries;
    const memory = readMemory.parse([denied('memory|stats')]).stats;
    const config = readConfig.parse([denied('config|get')]);
    const sentences = [clients, slowLog, memory, config].map((part) =>
      part?.kind === 'unavailable' ? part.unavailable.sentence : '',
    );
    expect(sentences.map((sentence) => sentence.slice(0, sentence.indexOf(':')))).toEqual([
      'CLIENT LIST needs a user that may run it',
      'SLOWLOG GET needs a user that may run it',
      'MEMORY STATS needs a user that may run it',
      'CONFIG GET needs a user that may run it',
    ]);
  });
});
