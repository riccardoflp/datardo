/**
 * The query beside the results driven through the window (`query.position`): the toggle and `settings.json`, the
 * place a narrow tab keeps, the splitter by the pointer and the keys, and what is typed kept as the query moves. The
 * query pane is checked for accessibility in both themes. The exit criterion of M40 is the first test.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import {
  barOf,
  bothThemes,
  documentRows,
  editorText,
  fieldOf,
  openCollection,
  setEditor,
  startIntent,
  startWithMongo,
  testMongo,
} from './collection-app';

const mongo = testMongo();
const running: StartedApp[] = [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await mongo.start(async (db) => {
    await db('shop')
      .collection('orders')
      .insertMany([
        { status: 'paid', total: 10 },
        { status: 'paid', total: 50 },
        { status: 'new', total: 70 },
      ]);
  });
});

test.afterAll(async () => {
  await mongo.stop();
});

test.afterEach(async () => {
  for (const started of running.splice(0)) {
    await started.close().catch((error: unknown) => {
      console.warn('Datardo was already closed:', error);
    });
  }
});

/** A Datardo with a window `width` pixels wide, on the tab of `shop.orders`. */
async function openOrders(width: number): Promise<StartedApp> {
  const started = await startWithMongo(mongo);
  running.push(started);
  await started.window.setViewportSize({ width, height: 1_000 });
  await openCollection(started.window, 'shop', 'orders');
  await expect(documentRows(started.window)).toHaveCount(3);
  return started;
}

/** What `settings.json` holds, nothing when it is not written yet. */
async function stored(started: StartedApp): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(join(started.dataFolder, 'settings.json'), 'utf8')) as Record<string, unknown>;
  } catch {
    // Not written yet: nothing is stored.
    return {};
  }
}

function toggleOf(window: Page) {
  return barOf(window).locator('button[data-feature="query.position@query-bar"]');
}

/** The layout of the section: `data-query-side` says whether the query is in the pane at the right. */
function layoutOf(window: Page) {
  return window.locator('[data-query-side]').first();
}

/** The width the query takes in the layout: the pane's when it is at the right. */
async function paneWidth(window: Page): Promise<number> {
  const box = await layoutOf(window).locator(':scope > div').first().boundingBox();
  return Math.round(box?.width ?? 0);
}

function splitterOf(window: Page) {
  return window.getByRole('separator', { name: 'Width of the query' });
}

test.describe('query.position', () => {
  test('in a window 1,280 px wide the query stays above with the explorer shown and its toggle says why; with the explorer hidden it is at the right, 380 px wide', async () => {
    test.setTimeout(120_000);
    const started = await openOrders(1_280);
    const { window } = started;
    await expect(toggleOf(window)).toHaveAttribute('aria-pressed', 'false');
    await expect(toggleOf(window)).toHaveAttribute('title', 'Query at the right of the results');
    await toggleOf(window).click();
    await expect.poll(async () => (await stored(started))['datardo.query.position']).toBe('right');
    await expect(toggleOf(window)).toHaveAttribute('aria-pressed', 'true');
    await expect(toggleOf(window)).toHaveAttribute(
      'title',
      'Query at the right of the results: the tab is too narrow, so it is above them for now',
    );
    await expect(layoutOf(window)).toHaveAttribute('data-query-side', 'false');
    await window.keyboard.press('Control+B');
    await expect(layoutOf(window)).toHaveAttribute('data-query-side', 'true');
    await expect.poll(() => paneWidth(window)).toBe(380);
    await expect(toggleOf(window)).toHaveAttribute('title', 'Query above the results');
    await window.keyboard.press('Control+B');
    await expect(layoutOf(window)).toHaveAttribute('data-query-side', 'false');
    await window.keyboard.press('Control+B');
    await expect.poll(() => paneWidth(window)).toBe(380);
  });

  test('the toggle writes the place in settings.json and removes it, keeping what is typed in Filter and its focus', async () => {
    test.setTimeout(120_000);
    const started = await openOrders(1_920);
    const { window } = started;
    await setEditor(window, 'Filter', '{ status: ');
    await startIntent(window, 'query.position', 'right');
    await expect(layoutOf(window)).toHaveAttribute('data-query-side', 'true');
    await expect.poll(() => paneWidth(window)).toBe(380);
    await expect.poll(async () => (await stored(started))['datardo.query.position']).toBe('right');
    expect(await editorText(window, 'Filter')).toBe('{ status: ');
    await expect(fieldOf(window, 'Filter')).toBeFocused();
    await expect(documentRows(window)).toHaveCount(3);
    await bothThemes(window);
    await toggleOf(window).click();
    await expect(layoutOf(window)).toHaveAttribute('data-query-side', 'false');
    await expect.poll(async () => 'datardo.query.position' in (await stored(started))).toBe(false);
    expect(await editorText(window, 'Filter')).toBe('{ status: ');
  });

  test('the splitter sets the width of the pane by a drag, the keys and a double click', async () => {
    test.setTimeout(120_000);
    const { window } = await openOrders(1_920);
    await startIntent(window, 'query.position', 'right');
    const splitter = splitterOf(window);
    await expect(splitter).toHaveAttribute('aria-valuenow', '380');
    const box = await splitter.boundingBox();
    if (box === null) {
      throw new Error('The splitter of the query pane is not shown.');
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await window.mouse.move(x, y);
    await window.mouse.down();
    await window.mouse.move(x - 20, y);
    await window.mouse.move(x - 40, y);
    await window.mouse.up();
    await expect(splitter).toHaveAttribute('aria-valuenow', '420');
    await expect.poll(() => paneWidth(window)).toBe(420);
    await splitter.focus();
    await window.keyboard.press('ArrowLeft');
    await expect(splitter).toHaveAttribute('aria-valuenow', '440');
    await window.keyboard.press('Shift+ArrowRight');
    await expect(splitter).toHaveAttribute('aria-valuenow', '380');
    await window.keyboard.press('Home');
    await expect(splitter).toHaveAttribute('aria-valuenow', '260');
    await splitter.dblclick();
    await expect(splitter).toHaveAttribute('aria-valuenow', '380');
  });
});
