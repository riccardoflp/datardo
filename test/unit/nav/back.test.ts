import { describe, expect, it } from 'vitest';
import { destination, planFor, visit, withoutUnreachable } from '../../../src/features/nav/back';
import { view as scopeBar } from '../../../src/features/nav/scope-bar';
import { homePlace, initialNavState, type NavHistory, type NavPlace } from '../../../src/shared/state/nav';
import { connectionId } from '../../../src/shared/ids';
import { input, local, staging } from './inputs';

const place = (name: string, more: Partial<NavPlace> = {}): NavPlace => ({
  shows: `collection:${name}`,
  path: `Local / shop / ${name}`,
  connection: local.id,
  ...more,
});
const orders = place('orders');
const users = place('users');
const products = place('products');

function visited(...places: NavPlace[]): NavHistory {
  return places.reduce(visit, { places: [], index: -1 });
}

function back(history: NavHistory): NavHistory {
  const index = destination(history, 'back', [local, staging]);
  return index === undefined ? history : { ...history, index };
}

describe('nav.back', () => {
  it('after orders, users and Home, Back makes users active, Back again orders, Forward users', () => {
    let history = visited(orders, users, homePlace);
    history = back(history);
    expect(history.places[history.index]).toBe(users);
    history = back(history);
    expect(history.places[history.index]).toBe(orders);
    const forward = destination(history, 'forward', [local]);
    expect(forward === undefined ? undefined : history.places[forward]).toBe(users);
  });

  it('a change of section is a place: Back from Indexes shows Schema, then Documents', () => {
    let history = visited(
      place('orders', { section: 'Documents' }),
      place('orders', { section: 'Schema' }),
      place('orders', { section: 'Indexes' }),
    );
    history = back(history);
    expect(history.places[history.index]?.section).toBe('Schema');
    history = back(history);
    expect(history.places[history.index]?.section).toBe('Documents');
  });

  it('the same place twice in a row is kept once', () => {
    expect(visited(orders, orders, orders).places).toHaveLength(1);
  });

  it('after orders, users, Back and then products, Forward is disabled', () => {
    const history = visit(back(visited(orders, users)), products);
    expect(history.places).toEqual([orders, products]);
    expect(destination(history, 'forward', [local])).toBeUndefined();
  });

  it('plans going back to the place, as its path says', () => {
    const nav = input({ connections: [local], nav: { history: visited(orders, users) } });
    expect(planFor(nav, { args: { direction: 'back' } })).toMatchObject({
      kind: 'run',
      plan: { steps: [{ text: 'go back to Local / shop / orders', action: 'nav.go-to-place', args: { index: 0 } }] },
    });
  });

  it('right after Datardo starts, Back and Forward are both disabled', () => {
    const bar = scopeBar(input({ nav: initialNavState }));
    expect([bar.back.disabled, bar.forward.disabled]).toEqual([true, true]);
    expect(planFor(input(), { args: { direction: 'back' } })).toMatchObject({ plan: { steps: [] } });
  });

  it('never stops on a place of a connection that was removed', () => {
    const ofStaging = place('accounts', { connection: staging.id, shows: 'collection:staging-accounts' });
    const history = visited(orders, ofStaging, users);
    expect(destination(history, 'back', [local])).toBe(0);
    expect(withoutUnreachable(history, [local]).places).toEqual([orders, users]);
  });

  it('keeps the last 100 places: the 101st makes the first unreachable', () => {
    const places = Array.from({ length: 101 }, (_each, index) =>
      place(`c${String(index)}`, { connection: connectionId('local') }),
    );
    let history = visited(...places);
    expect(history.places).toHaveLength(100);
    for (let press = 0; press < 100; press += 1) {
      history = back(history);
    }
    expect(history.places[history.index]).toBe(places[1]);
  });
});
