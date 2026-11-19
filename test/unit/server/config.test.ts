import { describe, expect, it } from 'vitest';
import { view, type ConfigState } from '../../../src/features/server/config';
import { parse, parametersOf } from '../../../src/features/server/read-config';
import { readsOf } from '../../../src/features/server/show';
import { at, bytes, cacheLocal, failed, recordedRedis } from './context';

function parameters(...pairs: readonly (readonly [string, string])[]): NonNullable<ConfigState['parameters']> {
  return { kind: 'read', value: parametersOf(pairs.flatMap(([name, value]) => [bytes(name), bytes(value)])) };
}

function state(change: Partial<ConfigState> = {}): ConfigState {
  return {
    connection: cacheLocal.id,
    parameters: parameters(
      ['maxmemory', '4294967296'],
      ['maxmemory-policy', 'noeviction'],
      ['maxmemory-samples', '5'],
      ['requirepass', 's3cret'],
      ['dir', ''],
      ['port', '6379'],
    ),
    readAt: at(14, 2, 11),
    filter: '',
    ...change,
  };
}

describe('server.config', () => {
  it('the filter maxmem shows the parameters whose name or value holds it, and the count says how many', () => {
    const shown = view(state({ filter: 'MAXMEM' }));
    expect(shown.table?.rows.map((row) => row.name)).toEqual(['maxmemory', 'maxmemory-policy', 'maxmemory-samples']);
    expect(shown.toolbar.count).toBe('3 of 6 parameters · 14:02:11');
    expect(shown.toolbar.filter.placeholder).toBe('Filter by parameter or value');
  });

  it('requirepass shows *** with its tooltip on a server with a password, and not set on one without', () => {
    expect(view(state()).table?.rows.find((row) => row.name === 'requirepass')).toMatchObject({
      value: '***',
      look: 'hidden',
      tooltip: 'Hidden: Datardo does not show the passwords of the server.',
    });
    expect(view(state({ parameters: parameters(['requirepass', '']) })).table?.rows[0]).toMatchObject({
      value: 'not set',
      look: 'not-set',
    });
    expect(view(state()).table?.rows.find((row) => row.name === 'dir')).toMatchObject({
      value: 'empty',
      look: 'empty',
    });
  });

  it('Copy value on the row of requirepass copies ***', () => {
    const row = view(state()).table?.rows.find((each) => each.name === 'requirepass');
    expect(row?.menu).toEqual([
      { kind: 'copy', label: 'Copy parameter', text: 'requirepass' },
      { kind: 'copy', label: 'Copy value', text: '***' },
    ]);
  });

  it('the filter s3cret shows no row on a server whose password is s3cret', () => {
    const shown = view(state({ filter: 's3cret' }));
    expect(shown.table?.rows).toEqual([]);
    expect(shown.noMatch).toBeDefined();
    expect(JSON.stringify(view(state()))).not.toContain('s3cret');
  });

  it('the table has no control that edits: its rows only copy; the notice says how to change a parameter', () => {
    const shown = view(state());
    const kinds = new Set(shown.table?.rows.flatMap((row) => row.menu.map((control) => control.kind)));
    expect([...kinds]).toEqual(['copy']);
    expect(shown.notice.text).toBe(
      'The configuration is read-only in this release. To change a parameter, run CONFIG SET in the console, which confirms it.',
    );
    expect(shown.notice.openConsole).toMatchObject({ label: 'Open console', feature: 'console.show' });
  });

  it('with Auto, CONFIG GET * is sent when the section is chosen and not again until Refresh', () => {
    const input = { connection: cacheLocal.id, last: {} };
    expect(readsOf('configuration', 'chosen', input).map((each) => each.read)).toEqual(['server.read-config']);
    expect(readsOf('configuration', 'auto', input)).toEqual([]);
    expect(readsOf('configuration', 'refresh', input).map((each) => each.read)).toEqual(['server.read-config']);
  });

  it('a managed server that turned CONFIG off shows its sentence and no table; an ACL denial its own', () => {
    const off = view(
      state({ parameters: parse([failed("ERR unknown command 'CONFIG', with args beginning with: 'GET' '*'")]) }),
    );
    expect(off.error).toMatch(/^This server does not allow CONFIG GET: ERR unknown command/u);
    expect(off.table).toBeUndefined();
    const denied = view(
      state({ parameters: parse([failed("NOPERM User app has no permissions to run the 'config|get' command")]) }),
    );
    expect(denied.error).toMatch(/^CONFIG GET needs a user that may run it: /u);
  });

  it('the recorded configuration of Redis 7.4 is shown whole', () => {
    const read = parse([recordedRedis('redis-7.4-server-config-get-all-resp3.json')]);
    const shown = view(state({ parameters: read }));
    expect(shown.table?.rows.find((row) => row.name === 'requirepass')?.value).toBe('not set');
    expect(shown.toolbar.count).toMatch(/^(\d|,)+ of (\d|,)+ parameters · 14:02:11$/u);
  });
});
