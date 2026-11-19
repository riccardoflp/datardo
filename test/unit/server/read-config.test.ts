import { describe, expect, it } from 'vitest';
import { isSecretParameter, parametersOf, parse, request } from '../../../src/features/server/read-config';
import { bytes, cacheLocal, commandsOf, contextOn, failed, recordedRedis } from './context';

function config(...pairs: readonly (readonly [string, string])[]): ReturnType<typeof parametersOf> {
  return parametersOf({ kind: 'map', entries: pairs.map(([name, value]) => [bytes(name), bytes(value)]) });
}

describe('server.read-config', () => {
  it('sends CONFIG GET *', () => {
    expect(commandsOf(request(contextOn('server.read-config'), { connection: cacheLocal.id }))).toEqual([
      'CONFIG GET *',
    ]);
  });

  it('requirepass s3cret gives ***; masterauth and tls-key-file-pass too', () => {
    expect(
      config(['requirepass', 's3cret'], ['masterauth', 's3cret'], ['tls-key-file-pass', 's3cret']).map((each) => [
        each.name,
        each.value,
        each.secret,
      ]),
    ).toEqual([
      ['masterauth', '***', true],
      ['requirepass', '***', true],
      ['tls-key-file-pass', '***', true],
    ]);
    expect(isSecretParameter('tls-client-key-file-pass')).toBe(true);
    expect(isSecretParameter('Some-Secret')).toBe(true);
  });

  it('requirepass with an empty value gives an empty value', () => {
    expect(config(['requirepass', ''])).toEqual([{ name: 'requirepass', value: '', secret: true }]);
  });

  it('masteruser, maxmemory and tls-auth-clients are not masked, and values stay as the server wrote them', () => {
    expect(
      config(
        ['tls-auth-clients', 'yes'],
        ['maxmemory', '4294967296'],
        ['masteruser', 'replicator'],
        ['save', '3600 1 300 100 60 10000'],
      ),
    ).toEqual([
      { name: 'masteruser', value: 'replicator', secret: false },
      { name: 'maxmemory', value: '4294967296', secret: false },
      { name: 'save', value: '3600 1 300 100 60 10000', secret: false },
      { name: 'tls-auth-clients', value: 'yes', secret: false },
    ]);
  });

  it('after parse, the text s3cret is nowhere in what goes to the window process', () => {
    const read = parse([[bytes('requirepass'), bytes('s3cret'), bytes('masterauth'), bytes('s3cret')]]);
    expect(JSON.stringify(read)).not.toContain('s3cret');
  });

  it('the same configuration read on RESP3 and on RESP2 gives the same rows, sorted by name (recorded from Redis 7.4)', () => {
    const resp3 = parametersOf(recordedRedis('redis-7.4-server-config-get-all-resp3.json'));
    const resp2 = parametersOf(recordedRedis('redis-7.4-server-config-get-all-resp2.json'));
    expect(resp2).toEqual(resp3);
    expect(resp3.length).toBeGreaterThan(100);
    const names = resp3.map((each) => each.name);
    expect(names).toEqual(names.toSorted());
    expect(resp3.find((each) => each.name === 'requirepass')).toEqual({ name: 'requirepass', value: '', secret: true });
    expect(resp3.find((each) => each.name === 'maxmemory')?.secret).toBe(false);
  });

  it('a server that refuses CONFIG gives the sentence of server.unavailable', () => {
    expect(parse([failed("ERR unknown command 'CONFIG', with args beginning with: 'GET' '*'")])).toMatchObject({
      kind: 'unavailable',
      unavailable: { kind: 'not-there' },
    });
  });
});
