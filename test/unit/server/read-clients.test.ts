import { describe, expect, it } from 'vitest';
import { view } from '../../../src/features/server/clients';
import {
  clientIdRequest,
  clientOfLine,
  parse,
  parseClientId,
  request,
} from '../../../src/features/server/read-clients';
import { initialClientSort } from '../../../src/features/server/clients';
import { bytes, cacheLocal, commandText, commandsOf, contextOn, failed, recordedBytes } from './context';

const line42 =
  'id=42 addr=10.0.0.7:52144 laddr=10.0.0.2:6379 fd=8 name=orders-api age=3600 idle=3 flags=b db=0 sub=0 psub=0 multi=-1 cmd=blpop user=app tot-mem=22298';

describe('server.read-clients', () => {
  it('sends CLIENT LIST, and CLIENT ID once to know the page’s own client', () => {
    expect(commandsOf(request(contextOn('server.read-clients'), { connection: cacheLocal.id }))).toEqual([
      'CLIENT LIST',
    ]);
    expect(commandText(clientIdRequest())).toBe('CLIENT ID');
    expect(parseClientId(149)).toBe('149');
    expect(parseClientId(failed('NOPERM no'))).toBeUndefined();
  });

  it('the line of the client 42 gives the client 42 with each of its values', () => {
    expect(clientOfLine(line42)).toMatchObject({
      id: '42',
      address: '10.0.0.7:52144',
      localAddress: '10.0.0.2:6379',
      name: 'orders-api',
      ageSeconds: 3600,
      idleSeconds: 3,
      flags: 'b',
      database: 0,
      channels: 0,
      patterns: 0,
      queued: -1,
      command: 'blpop',
      user: 'app',
      memoryBytes: 22298,
      own: false,
      datardo: false,
    });
  });

  it('name= gives an empty name, shown as —', () => {
    const client = clientOfLine('id=7 addr=10.0.0.8:1 name= age=1 idle=1 flags=N db=0 cmd=ping');
    expect(client.name).toBe('');
    const shown = view({
      connection: cacheLocal,
      clients: { kind: 'read', value: [client] },
      filter: '',
      idleAtMost: '',
      sort: initialClientSort,
      disconnecting: [],
    });
    expect(shown.table?.rows[0]?.name).toBe('—');
  });

  it('a line without laddr, as Redis 6.0 writes it, gives no local address and all the other fields', () => {
    const client = clientOfLine(line42.replace(' laddr=10.0.0.2:6379', ''));
    expect(client.localAddress).toBeUndefined();
    expect(client).toMatchObject({ id: '42', address: '10.0.0.7:52144', name: 'orders-api', memoryBytes: 22298 });
  });

  it('a field not known (io-thread=1) is kept for the inspector island and is in no column', () => {
    const client = clientOfLine(`${line42} io-thread=1`);
    expect(client.fields).toContainEqual(['io-thread', '1']);
    const shown = view({
      connection: cacheLocal,
      clients: { kind: 'read', value: [client] },
      filter: '',
      idleAtMost: '',
      sort: initialClientSort,
      selected: '42',
      disconnecting: [],
    });
    expect(shown.inspector?.fields).toContainEqual(['io-thread', '1']);
    expect(shown.table?.columns.map((column) => column.column)).not.toContain('io-thread');
  });

  it('a field the line does not have is missing, not 0', () => {
    const client = clientOfLine('id=3 addr=10.0.0.9:1 age=5');
    expect(client.memoryBytes).toBeUndefined();
    expect(client.user).toBeUndefined();
    expect(client.shardChannels).toBeUndefined();
  });

  it('the client CLIENT ID named is the page’s own; a name starting with datardo is Datardo’s (recorded from Redis 7.4)', () => {
    const read = parse([recordedBytes('redis-7.4-server-client-list.txt')], { connection: cacheLocal.id, own: '149' });
    expect(read.kind).toBe('read');
    const [client] = read.kind === 'read' ? read.value : [];
    expect(client).toMatchObject({
      id: '149',
      command: 'client|list',
      protocol: 3,
      libraryName: '',
      libraryVersion: '',
      own: true,
      datardo: true,
    });
    expect(parse([bytes('id=5 name=datardo-pubsub\nid=6 name=app\n')]).kind === 'read').toBe(true);
    const two = parse([bytes('id=5 name=datardo-pubsub\nid=6 name=app\n')]);
    expect(two.kind === 'read' ? two.value.map((each) => [each.datardo, each.own]) : []).toEqual([
      [true, false],
      [false, false],
    ]);
  });

  it('a server that refuses CLIENT LIST gives the sentence of server.unavailable and no rows', () => {
    const read = parse([failed("NOPERM User app has no permissions to run the 'client|list' command")]);
    expect(read).toMatchObject({
      kind: 'unavailable',
      unavailable: {
        sentence:
          "CLIENT LIST needs a user that may run it: NOPERM User app has no permissions to run the 'client|list' command",
      },
    });
  });
});
