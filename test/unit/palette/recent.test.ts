import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { feature as activate } from '../../../src/features/tab/activate';
import { parse, recentEntries, recentInGoToOf, request } from '../../../src/features/palette/recent';
import { start as startPalette } from '../../../src/main/palette';
import { appPage, contextOf } from '../tab/harness';
import { collection, harness, home, orders, staging, users } from './harness';

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-recent-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function titles(h: ReturnType<typeof harness>): readonly string[] {
  return recentEntries(h.state()).map((entry) => entry.title);
}

describe('palette.recent', () => {
  it('after making active orders, then users, then orders again, the list starts with orders, then users', async () => {
    const h = harness();
    await h.open(orders);
    await h.open(users);
    await h.start(activate, { tab: h.tab('orders').id });
    expect(titles(h)).toEqual(['orders', 'users']);
  });

  it('with orders active, Go to with nothing typed starts with users, not with orders', async () => {
    const h = harness();
    await h.open(users);
    await h.open(orders);
    expect(recentInGoToOf(h.state()).map((entry) => entry.title)).toEqual(['users']);
  });

  it('Settings and Home never appear among the recent places', async () => {
    const h = harness();
    await h.open(home);
    await h.open(appPage('settings'));
    await h.open(orders);
    await h.open(home);
    expect(titles(h)).toEqual(['orders']);
  });

  it('the list is the same after quitting and starting again', async () => {
    const first = harness();
    const quits: (() => Promise<void>)[] = [];
    const before = { ...first.services, dataFolder: folder, onQuit: (flush: () => Promise<void>) => quits.push(flush) };
    await startPalette(before);
    await first.open(orders);
    await first.open(users);
    await Promise.all(quits.map((flush) => flush()));
    const written = JSON.parse(await readFile(join(folder, 'home.json'), 'utf8')) as { version: number };
    expect(written.version).toBe(1);
    const second = harness();
    await startPalette({ ...second.services, dataFolder: folder });
    expect(titles(second)).toEqual(['users', 'orders']);
    // No tab was restored: Datardo starts on Home (D7).
    expect(second.titles()).toEqual(['Home']);
  });

  it('after 51 different collections were opened, the first one is no longer listed', async () => {
    const h = harness();
    for (let index = 1; index <= 51; index += 1) {
      await h.open(collection(`c${String(index)}`));
    }
    expect(titles(h)).toHaveLength(50);
    expect(titles(h)).not.toContain('c1');
  });

  it('removing the connection Staging removes every recent place of Staging', async () => {
    const h = harness();
    await startPalette(h.services);
    await h.open(collection('orders', 'shop', staging.id));
    await h.open(orders);
    h.holder.dispatch({ slice: 'connections', type: 'removed', connection: staging.id });
    expect(recentEntries(h.state()).map((entry) => entry.place.shows)).toEqual([orders]);
  });

  it("is read from Datardo's own data, and asks nothing of a deployment", () => {
    const h = harness();
    expect(request(contextOf(h.state(), 'palette.recent'), null)).toEqual({
      kind: 'app',
      action: 'palette.recent',
      args: null,
    });
    expect(parse([[{ shows: orders, at: 1 }, { shows: home, at: 2 }, 'not a place']])).toEqual([
      { shows: orders, at: 1 },
    ]);
  });
});
