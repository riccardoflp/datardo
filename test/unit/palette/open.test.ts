import { describe, expect, it } from 'vitest';
import { open, prefixAsked, view } from '../../../src/features/palette/open';
import { feature as openResult, staysOpen } from '../../../src/features/palette/open-result';
import { contextOf } from '../tab/harness';
import { collection, harness, knowledgeOf, local, named, orders, staging, users } from './harness';

describe('palette.open', () => {
  it('with nothing typed, lists the recent places under Recent, then the prefixes', async () => {
    const h = harness();
    await h.open(orders);
    await h.open(users);
    const shown = view({ state: h.state(), knowledge: knowledgeOf(h.state()), typed: '' });
    expect(shown.sections).toMatchObject([{ heading: 'Recent', rows: [{ name: 'orders', context: 'Local / shop' }] }]);
    expect(shown.prefixes?.list.map((each) => `${each.prefix} ${each.source}`)).toEqual([
      '> commands',
      '@ connections',
      '# collections',
      ': keys',
      '/ pages',
      '? saved queries',
      '= open tabs',
    ]);
    expect(shown.prefixes?.intro).toBeUndefined();
  });

  it('with no recent place, the line of the prefixes comes under the first-use line', () => {
    const h = harness();
    const shown = view({ state: h.state(), knowledge: knowledgeOf(h.state()), typed: '' });
    expect(shown.sections).toEqual([]);
    expect(shown.prefixes?.intro).toBe(
      'Type to find a collection, a key, a page, a connection, a saved query or a command.',
    );
  });

  it('Ctrl+Shift+P opens Go to with > typed, and every command listed by title', () => {
    expect(prefixAsked({ args: 'commands' })).toBe('>');
    expect(prefixAsked({ args: 'tabs' })).toBe('=');
    expect(prefixAsked({ args: { prefix: '=' } })).toBe('=');
    const h = harness();
    const outcome = open.plan(contextOf(h.state(), 'palette.open'), { args: 'commands' });
    expect(outcome).toMatchObject({
      kind: 'run',
      plan: { steps: [{ action: 'palette.show', args: { prefix: '>' } }] },
    });
    const shown = view({ state: h.state(), knowledge: knowledgeOf(h.state()), typed: '>' });
    const titles = shown.sections.flatMap((section) => section.rows.map((row) => row.name));
    expect(titles).toContain('Go to…');
    expect(titles).toEqual([...titles].sort());
  });

  it('typing ord lists the collections whose name holds ord, with ord in bold in each name', () => {
    const h = harness();
    h.connect(local.id);
    const knowledge = knowledgeOf(h.state(), {
      [local.id]: [named('shop', 'orders'), named('shop', 'users'), named('shop', 'userOrders')],
    });
    const shown = view({ state: h.state(), knowledge, typed: 'ord' });
    const rows = shown.sections.flatMap((section) => section.rows).filter((row) => row.kind === 'collection');
    expect(
      rows.map((row) =>
        row.parts
          .filter((part) => part.bold)
          .map((part) => part.text)
          .join(''),
      ),
    ).toEqual(['ord', 'Ord']);
    expect(rows.map((row) => row.name)).toEqual(['orders', 'userOrders']);
  });

  it('typing zzzz, which nothing matches, shows Nothing matches "zzzz".', () => {
    const h = harness();
    const shown = view({ state: h.state(), knowledge: knowledgeOf(h.state()), typed: 'zzzz' });
    expect(shown.message).toBe('Nothing matches "zzzz".');
    expect(shown.announcement).toBe('0 results');
  });

  it('a screen reader is told, for a row, its name, its kind and its context', () => {
    const h = harness();
    h.connect(local.id);
    const shown = view({
      state: h.state(),
      knowledge: knowledgeOf(h.state(), { [local.id]: [named('shop', 'orders')] }),
      typed: '#orders',
    });
    expect(shown.sections[0]?.rows[0]?.spoken).toBe('orders, collection, Local / shop');
  });
});

describe('palette.open-result', () => {
  it('Enter on the collection users of Local makes its collection tab active, opening it if needed', async () => {
    const h = harness();
    h.connect(local.id);
    await h.start(openResult, { opens: { kind: 'show', shows: users }, background: false });
    expect(h.active()).toBe('users');
    await h.open(orders);
    await h.start(openResult, { opens: { kind: 'show', shows: users }, background: false });
    expect(h.titles().filter((title) => title === 'users')).toHaveLength(1);
    expect(h.active()).toBe('users');
  });

  it('Ctrl+Enter on users and then on order_items adds both tabs and leaves the active tab active and Go to open', async () => {
    const h = harness();
    await h.open(orders);
    const items = collection('order_items');
    for (const shows of [users, items]) {
      await h.start(openResult, { opens: { kind: 'show', shows }, background: true });
      expect(staysOpen({ kind: 'show', shows }, 'background')).toBe(true);
    }
    expect(h.titles()).toEqual(['orders', 'users', 'order_items']);
    expect(h.active()).toBe('orders');
  });

  it('Enter on the connection Staging plans what choosing it in the connection switcher plans', () => {
    const h = harness();
    const outcome = openResult.plan(contextOf(h.state(), 'palette.open-result'), {
      args: { opens: { kind: 'connection', connection: staging.id }, background: false },
    });
    expect(outcome.kind).not.toBe('refuse');
    expect(JSON.stringify(outcome)).toContain(staging.id);
  });

  it('Enter on Zoom in runs the command, as its key does', () => {
    const h = harness();
    const outcome = openResult.plan(contextOf(h.state(), 'palette.open-result'), {
      args: { opens: { kind: 'command', command: 'window.zoom:in' }, background: false },
    });
    expect(outcome).toMatchObject({
      kind: 'run',
      plan: {
        title: 'Zoom in',
        steps: [{ action: 'palette.run-command', args: { feature: 'window.zoom', args: 'in' } }],
      },
    });
    expect(staysOpen({ kind: 'command', command: 'window.zoom:in' as never }, 'background')).toBe(false);
  });

  it('Enter on a row of an open tab of a collapsed group expands the group and makes the tab active', async () => {
    const h = harness();
    await h.open(orders);
    await h.open(collection('orders', 'shop', staging.id));
    h.holder.dispatch({ slice: 'tabs', type: 'collapsed', connection: local.id, collapsed: true });
    const tab = h
      .state()
      .tabs.tabs.find((each) => each.shows.kind === 'collection' && each.shows.connection === local.id);
    await h.start(openResult, { opens: { kind: 'tab', tab: tab?.id ?? '' }, background: false });
    expect(h.state().tabs.active).toBe(tab?.id);
    expect(h.state().tabs.collapsed).not.toContain(local.id);
  });
});
