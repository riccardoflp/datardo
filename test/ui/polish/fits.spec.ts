/**
 * M36, R10.9: the window works from 800 × 600 up. At 800 × 600, 1024 × 700, 1440 × 900 and 1920 × 1080, in both
 * themes, Home, Settings, a collection tab, the Monitor page, the keys tab, a value tab, the console and the Server
 * page have no box past its island, no island past the window, no control over another and no field of one line with
 * a scroll bar. The pages that need a server are skipped, and say so, when it cannot be reached.
 */
import { expect, test, type Page } from '@playwright/test';
import { startApp, type StartedApp } from '../app';
import { addMongo, testMongo } from '../query/collection-app';
import { closeAll } from '../table/parts-app';
import { fitProblems, themes, windowSizes } from './measure';
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

/** The page at every size and in both themes, with what does not fit at each. */
async function expectFits(window: Page, page: string): Promise<void> {
  const found: string[] = [];
  for (const size of windowSizes) {
    await window.setViewportSize(size);
    for (const theme of themes) {
      await window.emulateMedia({ colorScheme: theme });
      await window.waitForTimeout(200);
      for (const problem of await fitProblems(window)) {
        found.push(`${page} at ${String(size.width)} × ${String(size.height)}, ${theme}: ${problem}`);
      }
    }
  }
  await window.setViewportSize({ width: 1440, height: 900 });
  expect(found).toEqual([]);
}

test.describe('every page fits from 800 × 600 up (R10.9)', () => {
  test('Home and Settings', async () => {
    test.setTimeout(120_000);
    const window = await launch();
    await expectFits(window, 'Home');
    await openSettings(window);
    await expectFits(window, 'Settings');
  });

  test('a collection tab and the Monitor page', async () => {
    test.skip(!withMongo, 'No MongoDB server could be started.');
    test.setTimeout(180_000);
    const window = await launch();
    await addMongo(window, mongo.uri());
    await openPeople(window);
    await expectFits(window, 'people');
    await openMonitor(window);
    await expectFits(window, 'Monitor');
  });

  test('the keys tab, a value tab, the console and the Server page', async () => {
    test.skip(!withRedisServer, 'No Redis server answers at DATARDO_TEST_REDIS_URL.');
    test.setTimeout(240_000);
    const window = await launch();
    await addRedis(window);
    await openKeys(window);
    await expectFits(window, 'keys');
    await openHash(window);
    await expectFits(window, 'value');
    await openConsole(window);
    await expectFits(window, 'console');
    await openServer(window);
    await expectFits(window, 'Server');
  });
});
