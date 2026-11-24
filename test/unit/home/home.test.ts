import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { view as cardMenu } from '../../../src/features/home/card-menu';
import { view as cardView } from '../../../src/features/home/card';
import { view as connectionsView } from '../../../src/features/home/connections';
import { feature as forgetRecent } from '../../../src/features/home/forget-recent';
import { view as jumpBackIn } from '../../../src/features/home/jump-back-in';
import { open as showHome, view as homeView } from '../../../src/features/home/show';
import { view as connectionMenu } from '../../../src/features/connection/menu';
import { recentInGoToOf } from '../../../src/features/palette/recent';
import { feature as activate } from '../../../src/features/tab/activate';
import { feature as openResult } from '../../../src/features/palette/open-result';
import { start as startPalette } from '../../../src/main/palette';
import type { ConnectionView } from '../../../src/shared/connection';
import type { AppState } from '../../../src/shared/state';
import { collection, harness, keys, local, orders, saved, users, type PaletteHarness } from '../palette/harness';

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-home-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const production = saved('production', 'Production', 'mongodb', {
  folder: 'Live',
  color: 'red',
  readOnly: true,
  hosts: 'db1.example.com:27017,db2.example.com:27017',
  ssh: { host: 'bastion.example.com', port: 22, username: 'deploy', authentication: 'agent' },
});
const stagingDev = saved('staging', 'Staging', 'mongodb', { folder: 'Dev', hosts: 'staging.example.com:27017' });
const cacheLocal = saved('cache-local', 'Cache local', 'redis');
const cards = [production, stagingDev, local, cacheLocal];

function cardOf(state: AppState, connection: ConnectionView): ReturnType<typeof cardView> {
  return cardView({ connections: state.connections, connection });
}

function groups(h: PaletteHarness, typed = ''): readonly (readonly [string, readonly string[]])[] {
  return connectionsView({ state: h.state(), typed }).groups.map((group) => [
    group.heading ?? '',
    group.cards.map((card) => card.name),
  ]);
}

describe('home.show', () => {
  it('the first start shows the welcome, Add connection and Import connections…, and no filter', () => {
    const shown = homeView({ state: harness([]).state(), typed: '' });
    expect(shown).toMatchObject({
      kind: 'welcome',
      title: 'Welcome to Datardo',
      line: 'A client for MongoDB and Redis. Add a connection to begin.',
      add: { label: 'Add connection', feature: 'connection.add', element: 'connection.add@home' },
      import: { label: 'Import connections…', element: 'connection.import@home' },
    });
    expect(shown).not.toHaveProperty('filter');
  });

  it('when a connection is saved, Home shows its card and the welcome is gone; removing the last brings it back', () => {
    const h = harness([]);
    h.holder.dispatch({ slice: 'connections', type: 'saved', connection: local });
    expect(homeView({ state: h.state(), typed: '' }).kind).toBe('connections');
    h.holder.dispatch({ slice: 'connections', type: 'removed', connection: local.id });
    expect(homeView({ state: h.state(), typed: '' }).kind).toBe('welcome');
  });

  it('with saved connections, Home shows the filter row, Jump back in when something was opened, and Connections', async () => {
    const h = harness(cards);
    expect(homeView({ state: h.state(), typed: '' })).not.toHaveProperty('jumpBackIn');
    await h.open(orders);
    const shown = homeView({ state: h.state(), typed: '' });
    expect(shown).toMatchObject({
      kind: 'connections',
      filter: { placeholder: 'Filter connections', element: 'home.filter@home' },
      jumpBackIn: { heading: 'Jump back in' },
      connections: { heading: 'Connections' },
    });
  });

  it('showing Home connects nothing: its plan only opens the Home tab', () => {
    const h = harness(cards);
    const outcome = showHome.plan(contextOfHome(h), { args: null });
    expect(outcome).toMatchObject({ kind: 'run', plan: { steps: [], after: [{ kind: 'open', page: 'home' }] } });
  });

  it('Alt+Home from a collection tab makes the Home tab active and leaves the same connection current', async () => {
    const h = harness(cards);
    await h.open(orders);
    expect(h.state().nav.current).toBe(local.id);
    await h.open({ kind: 'app', page: 'home' });
    expect(h.active()).toBe('Home');
    expect(h.state().nav.current).toBe(local.id);
  });

  it('a connection that fails while Home is shown shows Failed on its card', () => {
    const h = harness(cards);
    h.holder.dispatch({
      slice: 'connections',
      type: 'state',
      connection: local.id,
      state: 'failed',
      reason: 'refused',
    });
    expect(cardOf(h.state(), local).state).toMatchObject({ text: 'Failed', line: 'refused' });
  });

  it('choosing Redis, quitting and starting again shows Home with Redis chosen', async () => {
    const first = harness(cards);
    const quits: (() => Promise<void>)[] = [];
    await startPalette({ ...first.services, dataFolder: folder, onQuit: (flush) => quits.push(flush) });
    await first.start(showHome, { engine: 'redis' });
    await Promise.all(quits.map((flush) => flush()));
    const second = harness(cards);
    await startPalette({ ...second.services, dataFolder: folder });
    const shown = homeView({ state: second.state(), typed: '' });
    expect(shown.kind === 'connections' ? shown.filter.engines?.find((engine) => engine.chosen)?.label : '').toBe(
      'Redis',
    );
  });
});

function contextOfHome(h: PaletteHarness): Parameters<typeof showHome.plan>[0] {
  return {
    feature: showHome.id,
    now: 0,
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'app' },
    state: h.state(),
  };
}

describe('home.jump-back-in', () => {
  it('after orders then users were active, starts with users then orders, with Local and their paths', async () => {
    const h = harness(cards);
    await h.open(orders);
    await h.open(users);
    expect(jumpBackIn(h.state())?.items.map((item) => [item.title, item.connection, item.path])).toEqual([
      ['users', 'Local', 'shop / users'],
      ['orders', 'Local', 'shop / orders'],
    ]);
  });

  it('a click on orders opens its collection tab', async () => {
    const h = harness(cards);
    await h.open(orders);
    await h.start(activate, { tab: h.tab('orders').id });
    const closedTab = h.tab('orders').id;
    h.holder.dispatch({ slice: 'tabs', type: 'closed', tab: closedTab, at: 0 });
    const [item] = jumpBackIn(h.state())?.items ?? [];
    expect(item?.opens).toEqual({ kind: 'show', shows: orders });
    await h.start(openResult, { opens: item?.opens ?? null, background: false });
    expect(h.active()).toBe('orders');
  });

  it('with 12 recent places, 8 are shown; on a first run there is no Jump back in', async () => {
    const h = harness(cards);
    expect(jumpBackIn(h.state())).toBeUndefined();
    for (let index = 1; index <= 12; index += 1) {
      await h.open(collection(`c${String(index)}`));
    }
    expect(jumpBackIn(h.state())?.items).toHaveLength(8);
  });

  it('typing prod in the filter leaves Jump back in as it was', async () => {
    const h = harness(cards);
    await h.open(orders);
    const before = homeView({ state: h.state(), typed: '' });
    const after = homeView({ state: h.state(), typed: 'prod' });
    expect(after.kind === 'connections' ? after.jumpBackIn : undefined).toEqual(
      before.kind === 'connections' ? before.jumpBackIn : undefined,
    );
  });

  it('a click with the middle button on an item adds its tab and leaves Home active', async () => {
    const h = harness(cards);
    await h.open(orders);
    await h.open({ kind: 'app', page: 'home' });
    h.holder.dispatch({ slice: 'tabs', type: 'closed', tab: h.tab('orders').id, at: 0 });
    await h.start(openResult, { opens: { kind: 'show', shows: orders }, background: true });
    expect(h.titles()).toContain('orders');
    expect(h.active()).toBe('Home');
  });
});

describe('home.forget-recent', () => {
  it('Remove from Jump back in on orders removes it from Home and from Recent in Go to; its tab stays open', async () => {
    const h = harness(cards);
    await h.open(orders);
    await h.open(users);
    const key = jumpBackIn(h.state())?.items.find((item) => item.title === 'orders')?.key ?? '';
    const outcome = await h.start(forgetRecent, { key });
    expect(outcome).toMatchObject({
      plan: { steps: [{ text: 'forget shop.orders of Local as a recent place', action: 'palette.forget-places' }] },
    });
    expect(jumpBackIn(h.state())?.items.map((item) => item.title)).toEqual(['users']);
    expect(h.titles()).toContain('orders');
  });

  it('with 9 recent places, removing one of the 8 shown brings the ninth into view', async () => {
    const h = harness(cards);
    for (let index = 1; index <= 9; index += 1) {
      await h.open(collection(`c${String(index)}`));
    }
    expect(jumpBackIn(h.state())?.items.map((item) => item.title)).not.toContain('c1');
    await h.start(forgetRecent, { key: jumpBackIn(h.state())?.items[0]?.key ?? '' });
    expect(jumpBackIn(h.state())?.items.map((item) => item.title)).toContain('c1');
  });

  it('Clear removes the whole part from Home, and Go to with nothing typed shows no Recent', async () => {
    const h = harness(cards);
    await h.open(orders);
    await h.open(users);
    const outcome = await h.start(forgetRecent, { all: true });
    expect(outcome).toMatchObject({ plan: { steps: [{ text: 'forget every recent place' }] } });
    expect(jumpBackIn(h.state())).toBeUndefined();
    expect(recentInGoToOf(h.state())).toEqual([]);
  });

  it('making the tab of orders active afterwards lists orders again', async () => {
    const h = harness(cards);
    await h.open(orders);
    await h.open(keys());
    await h.start(forgetRecent, { all: true });
    await h.start(activate, { tab: h.tab('orders').id });
    expect(jumpBackIn(h.state())?.items.map((item) => item.title)).toEqual(['orders']);
  });
});

describe('home.connections', () => {
  it('shows Local and Cache local under no heading, then the groups Dev and Live, in this order', () => {
    expect(groups(harness(cards))).toEqual([
      ['', ['Local', 'Cache local']],
      ['Dev 1', ['Staging']],
      ['Live 1', ['Production']],
    ]);
  });

  it('with no folder at all, the cards are shown with no other heading', () => {
    expect(groups(harness([local, cacheLocal]))).toEqual([['', ['Local', 'Cache local']]]);
  });

  it('a click on Live hides its cards and shows Live 1; with Live collapsed, prod shows Production', async () => {
    const h = harness(cards);
    await h.start(showHome, { folder: 'Live', collapsed: true });
    expect(groups(h).at(-1)).toEqual(['Live 1', []]);
    expect(groups(h, 'prod')).toEqual([['Live 1', ['Production']]]);
  });

  it('a folder none of whose connections passes the filter is not shown', () => {
    expect(groups(harness(cards), 'staging')).toEqual([['Dev 1', ['Staging']]]);
  });

  it('the card of the current connection is marked', () => {
    const h = harness(cards);
    h.makeCurrent(local.id);
    const marked = connectionsView({ state: h.state(), typed: '' }).groups.flatMap((group) =>
      group.cards.filter((card) => card.current).map((card) => card.name),
    );
    expect(marked).toEqual(['Local']);
  });
});

describe('home.card', () => {
  it('Production, a red read-only MongoDB connection through an SSH tunnel, shows what the card says', () => {
    const card = cardOf(harness(cards).state(), production);
    expect(card).toMatchObject({
      color: 'red',
      name: 'Production',
      engine: 'MongoDB',
      address: 'db1.example.com:27017 +1 via bastion.example.com',
      marks: ['Read-only', 'SSH'],
      button: { kind: 'connect', label: 'Connect' },
    });
  });

  it('the card of Archive, excluded from searches, shows Excluded from searches after its other marks, and Include in searches removes it', () => {
    const archive: ConnectionView = { ...production, name: 'Archive', excluded: true };
    expect(cardOf(harness(cards).state(), archive).marks).toEqual(['Read-only', 'SSH', 'Excluded from searches']);
    const menu = connectionMenu({
      connections: harness([archive]).state().connections,
      connection: archive,
      place: 'home',
    });
    const include = menu.entries.find((entry) => entry.kind === 'item' && entry.label === 'Include in searches');
    expect(include).toMatchObject({
      feature: 'tree.exclude-from-searches',
      args: { action: 'include', scope: 'connection' },
    });
    const { excluded: _excluded, ...included } = archive;
    expect(cardOf(harness(cards).state(), included).marks).toEqual(['Read-only', 'SSH']);
  });

  it('no card shows a user name, a password or the options of a connection string', () => {
    const careless = saved('careless', 'Careless', 'mongodb', {
      hosts: 'mongodb://ann:s3cret@db.example.com:27017/shop?authSource=admin',
    });
    const card = cardOf(harness([careless]).state(), careless);
    const shown = JSON.stringify(card);
    for (const secret of ['ann', 's3cret', 'authSource', 'shop']) {
      expect(shown).not.toContain(secret);
    }
  });

  it('while connecting the card shows Connecting… and Cancel; connected, Connected, its version and Go to', () => {
    const h = harness(cards);
    h.holder.dispatch({ slice: 'connections', type: 'state', connection: local.id, state: 'connecting' });
    expect(cardOf(h.state(), local)).toMatchObject({ state: { text: 'Connecting…' }, button: { label: 'Cancel' } });
    h.holder.dispatch({
      slice: 'connections',
      type: 'state',
      connection: local.id,
      state: 'connected',
      server: { engine: 'mongodb', version: '8.0.4', topology: { kind: 'standalone' }, hosts: [] },
    });
    expect(cardOf(h.state(), local)).toMatchObject({
      engine: 'MongoDB 8.0',
      state: { text: 'Connected' },
      button: { label: 'Go to', element: 'nav.switch-connection@home' },
    });
  });

  it('a failed connection shows Failed, the first line of the reason and Connect', () => {
    const h = harness(cards);
    h.holder.dispatch({
      slice: 'connections',
      type: 'state',
      connection: local.id,
      state: 'failed',
      reason: 'connect ECONNREFUSED\nat line 2',
    });
    expect(cardOf(h.state(), local)).toMatchObject({
      state: { text: 'Failed', line: 'connect ECONNREFUSED', tooltip: 'connect ECONNREFUSED\nat line 2' },
      button: { label: 'Connect' },
    });
  });

  it('a lost connection shows Reconnecting… and Go to, and no latency', () => {
    const h = harness(cards);
    h.holder.dispatch({
      slice: 'connections',
      type: 'state',
      connection: local.id,
      state: 'reconnecting',
      reason: 'drop',
    });
    const card = cardOf(h.state(), local);
    expect(card).toMatchObject({ state: { text: 'Reconnecting…', tooltip: 'drop' }, button: { label: 'Go to' } });
    expect(JSON.stringify(card)).not.toContain(' ms');
  });

  it('a MongoDB connection linked to a Redis connection shows redis-oplog; the Redis connection does not', () => {
    const linked = saved('linked', 'Linked', 'mongodb', { publishesTo: cacheLocal.id });
    const h = harness([linked, cacheLocal]);
    expect(cardOf(h.state(), linked).marks).toEqual(['redis-oplog']);
    expect(cardOf(h.state(), cacheLocal).marks).toEqual([]);
  });

  it('a screen reader says the name, the engine, the address, the marks and the state', () => {
    expect(cardOf(harness(cards).state(), production).spoken).toBe(
      'Production, MongoDB, db1.example.com:27017 +1 via bastion.example.com, Read-only, SSH',
    );
  });
});

describe('home.card-menu', () => {
  it('its entries, their order and their wording are those of connection.menu, with Connect first and no Go to', () => {
    const h = harness(cards);
    const menu = cardMenu({ connections: h.state().connections, connection: local });
    const same = connectionMenu({ connections: h.state().connections, connection: local, place: 'home' });
    expect(menu.entries).toEqual(same.entries);
    const labels = menu.entries.flatMap((entry) => (entry.kind === 'item' ? [entry.label] : []));
    expect(labels[0]).toBe('Connect');
    expect(labels).not.toContain('Go to');
  });

  it('the menu of a failed connection has Reconnect, which starts connection.reconnect', () => {
    const h = harness(cards);
    h.holder.dispatch({ slice: 'connections', type: 'state', connection: local.id, state: 'failed', reason: 'x' });
    const menu = cardMenu({ connections: h.state().connections, connection: local });
    expect(menu.entries).toContainEqual(expect.objectContaining({ feature: 'connection.reconnect' }));
  });
});
