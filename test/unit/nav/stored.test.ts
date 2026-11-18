import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../../src/storage/store';
import { islandFields, islandsOf, pinsFile, type PinsByConnection } from '../../../src/main/nav';
import { initialNavState, type Pin } from '../../../src/shared/state/nav';

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-pins-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const third: Pin = { kind: 'page', page: 'monitor', title: 'Monitor' };
const orders: Pin = { kind: 'collection', database: 'shop', collection: 'orders' };
const key: Pin = { kind: 'key', database: 0, keyHex: 'ff00' };

describe('nav.pin', () => {
  it('keeps the order of the pins of each connection after a restart', async () => {
    const written = new Store(folder, pinsFile);
    await written.load();
    written.set({ local: [third, orders, key], empty: [] });
    await written.flush();
    const read = new Store<PinsByConnection>(folder, pinsFile);
    expect((await read.load()).kind).toBe('current');
    expect(read.get()).toEqual({ local: [third, orders, key] });
    const text = await readFile(join(folder, 'pins.json'), 'utf8');
    expect(JSON.parse(text)).toMatchObject({ version: 1 });
  });

  it('leaves out a pin it cannot read and keeps the others', async () => {
    await writeFile(
      join(folder, 'pins.json'),
      JSON.stringify({
        version: 1,
        connections: { local: [orders, { kind: 'cake' }, { kind: 'key', database: 0, keyHex: 'xyz' }] },
      }),
    );
    const store = new Store(folder, pinsFile);
    await store.load();
    expect(store.get()).toEqual({ local: [orders] });
  });

  it('never writes a pins.json of a newer version, and sets a damaged one aside', async () => {
    await writeFile(join(folder, 'pins.json'), JSON.stringify({ version: 2, connections: { local: [orders] } }));
    const newer = new Store(folder, pinsFile);
    expect((await newer.load()).kind).toBe('newer');
    expect(newer.set({})).toBe(false);
    await writeFile(join(folder, 'pins.json'), '{ not json');
    const damaged = new Store(folder, pinsFile);
    expect((await damaged.load(new Date(0))).kind).toBe('damaged');
    expect((await readdir(folder)).some((name) => name.startsWith('pins.damaged-'))).toBe(true);
  });
});

describe('nav.resize', () => {
  it('remembers the widths and the hidden islands in window.json, and reads them back', () => {
    const nav = { ...initialNavState, widths: { explorer: 320, inspector: 400 }, explorerHidden: true };
    expect(islandFields(nav)).toEqual({
      explorerWidth: 320,
      inspectorWidth: 400,
      explorerHidden: true,
      inspectorHidden: false,
    });
    expect(islandsOf(islandFields(nav), initialNavState)).toEqual({
      widths: { explorer: 320, inspector: 400 },
      explorerHidden: true,
      inspectorHidden: false,
    });
  });

  it('keeps the defaults for fields that are missing or of the wrong type', () => {
    expect(islandsOf({ explorerWidth: 'wide' }, initialNavState)).toEqual({
      widths: { explorer: 280, inspector: 360 },
      explorerHidden: false,
      inspectorHidden: false,
    });
  });
});
