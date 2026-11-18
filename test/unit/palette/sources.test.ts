import { describe, expect, it } from 'vitest';
import { sources, type Looked } from '../../../src/features/palette/sources';
import { view } from '../../../src/features/palette/open';
import {
  cacheLocal,
  harness,
  keys,
  knowledgeOf,
  local,
  named,
  orders,
  staging,
  users,
  type PaletteHarness,
} from './harness';

const shopNames = [
  named('shop', 'orders'),
  named('shop', 'order_items'),
  named('shop', 'users'),
  named('crm', 'orders'),
];

/** Local connected and current, Staging not connected. */
function withLocal(): PaletteHarness {
  const h = harness();
  h.connect(local.id);
  h.makeCurrent(local.id);
  return h;
}

function look(h: PaletteHarness, typed: string): Extract<Looked, { kind: 'look' }> {
  const looked = sources(typed, {
    state: h.state(),
    knowledge: knowledgeOf(h.state(), { [local.id]: shopNames, [staging.id]: [named('shop', 'orders')] }),
  });
  if (looked.kind !== 'look') {
    throw new Error('Something was typed.');
  }
  return looked;
}

describe('palette.sources', () => {
  it('@ lists every saved connection, by folder, and nothing else', () => {
    const looked = look(withLocal(), '@');
    expect(looked.candidates.map((each) => [each.kind, each.name, each.context])).toEqual([
      ['connection', 'Local', 'MongoDB'],
      ['connection', 'Cache local', 'Redis'],
      ['connection', 'Staging', 'Dev · MongoDB'],
    ]);
  });

  it('>zoom lists Zoom in, Zoom out and Reset zoom, and no collection named zoom', () => {
    const h = withLocal();
    // At 100% Reset zoom is not offered (window.zoom): the window is zoomed first.
    h.holder.dispatch({ slice: 'settings', type: 'changed', name: 'datardo.window.zoom', value: 110 });
    const shown = view({
      state: h.state(),
      knowledge: knowledgeOf(h.state(), { [local.id]: [named('shop', 'zoom')] }),
      typed: '>zoom',
    });
    expect(shown.sections.flatMap((section) => section.rows.map((row) => [row.kind, row.name]))).toEqual([
      ['command', 'Zoom in'],
      ['command', 'Zoom out'],
      ['command', 'Reset zoom'],
    ]);
  });

  it('ord lists orders of Local, which is connected, and nothing of Staging, which is not', () => {
    const looked = look(withLocal(), 'ord');
    const contexts = looked.candidates.filter((each) => each.source === 'collections').map((each) => each.context);
    expect(contexts).toContain('Local / shop');
    expect(contexts.some((context) => context.startsWith('Staging'))).toBe(false);
  });

  it('with orders of Local open in a tab, ord lists orders of Local once, as a tab', async () => {
    const h = withLocal();
    await h.open(orders);
    const shown = view({
      state: h.state(),
      knowledge: knowledgeOf(h.state(), { [local.id]: shopNames }),
      typed: 'ord',
    });
    const rows = shown.sections.flatMap((section) => section.rows);
    const ofShop = rows.filter((row) => row.name.startsWith('orders') && !row.context.includes('crm'));
    expect(ofShop.map((row) => [row.kind, row.right])).toEqual([['tab', 'tab']]);
  });

  it('/mon lists the Monitor page of each connected MongoDB connection', () => {
    const h = withLocal();
    h.connect(staging.id);
    h.connect(cacheLocal.id);
    const looked = look(h, '/mon');
    expect(looked.candidates.filter((each) => each.name === 'Monitor').map((each) => each.context)).toEqual([
      'Local',
      'Staging',
    ]);
  });

  it(": alone shows Type part of a key's name. and asks for no key", () => {
    const h = withLocal();
    const shown = view({ state: h.state(), knowledge: knowledgeOf(h.state()), typed: ':' });
    expect(shown.message).toBe("Type part of a key's name.");
    expect(shown.keys).toBeUndefined();
  });

  it("= lists the open tabs in the order of the strip, with the name of each one's connection", async () => {
    const h = withLocal();
    await h.open(orders);
    await h.open(keys());
    await h.open(users);
    const looked = look(h, '=');
    expect(looked.candidates.map((each) => [each.name, each.context])).toEqual([
      ['orders', 'Local'],
      ['users', 'Local'],
      ['Keys', 'Cache local'],
    ]);
  });
});
