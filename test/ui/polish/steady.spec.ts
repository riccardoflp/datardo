/**
 * M36, R10.8: nothing in the window moves or changes size when the pointer passes over a control, on Home, Settings, a
 * collection tab, the Monitor page, the keys tab, a value tab, the console and the Server page, in both themes; and
 * finding again leaves the rows of a collection on screen until the new ones are drawn. The pages
 * that need a server are skipped, and say so, when it cannot be reached (testing.md).
 */
import { expect, test, type Page } from '@playwright/test';
import { startApp, type StartedApp } from '../app';
import { addMongo, barOf, testMongo } from '../query/collection-app';
import { closeAll, gridOf } from '../table/parts-app';
import { hoverShifts, themes } from './measure';
import {
  addRedis,
  cleanRedis,
  mongoStarts,
  openConsole,
  openHash,
  openKeys,
  openMonitor,
  openPeople,
  openServer,
  openSettings,
  redisAnswers,
  seedRedis,
} from './pages';

const mongo = testMongo();
const running: StartedApp[] = [];
let withMongo = false;
let withRedisServer = false;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  withMongo = await mongoStarts(mongo);
  withRedisServer = await redisAnswers();
  if (withRedisServer) {
    await seedRedis();
  }
});

test.afterAll(async () => {
  await closeAll(running);
  if (withRedisServer) {
    await cleanRedis();
  }
  if (withMongo) {
    await mongo.stop();
  }
});

test.afterEach(async () => {
  await closeAll(running);
});

async function launch(): Promise<Page> {
  const started = await startApp();
  running.push(started);
  await expect(started.window.getByRole('navigation', { name: 'Rail' })).toBeVisible();
  return started.window;
}

/** Hovers every control of the page in both themes, and expects nothing to have moved. */
async function expectSteady(window: Page): Promise<void> {
  for (const theme of themes) {
    await window.emulateMedia({ colorScheme: theme });
    expect(await hoverShifts(window), `the hover moves something in the ${theme} theme`).toEqual([]);
  }
}

test.describe('the window stays still under the pointer (R10.8)', () => {
  test('on Home and Settings', async () => {
    test.setTimeout(300_000);
    const window = await launch();
    await expectSteady(window);
    await openSettings(window);
    await expectSteady(window);
  });

  test('on a collection tab and the Monitor page', async () => {
    test.skip(!withMongo, 'No MongoDB server could be started.');
    // Every control of a table of 50 rows and of the Monitor page, in both themes: close to 10 minutes where the
    // window is drawn without a GPU (Xvfb on Linux).
    test.setTimeout(900_000);
    const window = await launch();
    await addMongo(window, mongo.uri());
    await openPeople(window);
    await expectSteady(window);
    await openMonitor(window);
    await expectSteady(window);
  });

  test('on the keys tab, a value tab, the console and the Server page', async () => {
    test.skip(!withRedisServer, 'No Redis server answers at DATARDO_TEST_REDIS_URL.');
    test.setTimeout(600_000);
    const window = await launch();
    await addRedis(window);
    await openKeys(window);
    await expectSteady(window);
    await openHash(window);
    await expectSteady(window);
    await openConsole(window);
    await expectSteady(window);
    await openServer(window);
    await expectSteady(window);
  });
});

test.describe('a read in progress leaves what was shown (R10.8)', () => {
  test('Find again never draws an empty grid', async () => {
    test.skip(!withMongo, 'No MongoDB server could be started.');
    test.setTimeout(120_000);
    const window = await launch();
    await addMongo(window, mongo.uri());
    await openPeople(window);
    // Counts, at every change of the page, the frames where the grid of documents has no row.
    await window.evaluate(() => {
      const state = globalThis as unknown as { emptyFrames: number };
      state.emptyFrames = 0;
      const check = (): void => {
        const grid = document.querySelector('[role="grid"][aria-label="Documents"]');
        if (grid === null || grid.querySelectorAll('tbody tr').length === 0) {
          state.emptyFrames += 1;
        }
      };
      new MutationObserver(check).observe(document.body, { subtree: true, childList: true });
    });
    for (let again = 0; again < 3; again += 1) {
      await barOf(window).getByRole('button', { name: 'Run query' }).click();
      await expect(gridOf(window).locator('td[data-pos="c:2:0:0"]')).toBeVisible();
    }
    const emptyFrames = await window.evaluate(() => (globalThis as unknown as { emptyFrames: number }).emptyFrames);
    expect(emptyFrames).toBe(0);
  });
});
