/**
 * The Chart section driven through the window (M24): the first look of the section, a Bar of `status` drawn with
 * `Enter`, the controls of each type, **Data** from the mode of the bar, a click on a bar that shows its documents,
 * **Save picture…** with the system dialog stubbed, the theme changed while a chart is shown, the choices kept when
 * the tab is closed and reopened, and **Code** of the chart; with the keyboard and the accessibility check in both
 * themes (QA15, QA16).
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { Int32 } from 'mongodb';
import type { StartedApp } from '../app';
import {
  barOf,
  bothThemes,
  documentRows,
  editorText,
  openCollection,
  startWithMongo,
  testMongo,
} from '../query/collection-app';
import { closeAll, goTo } from '../table/parts-app';

const mongo = testMongo();
const running: StartedApp[] = [];
let files = '';

test.beforeAll(async () => {
  test.setTimeout(180_000);
  files = await mkdtemp(join(tmpdir(), 'datardo-chart-ui-'));
  await mongo.start(async (db) => {
    await db('shop')
      .collection<{ _id: Int32 }>('orders')
      .insertMany(
        Array.from({ length: 30 }, (_, index) => ({
          _id: new Int32(index),
          status: index < 15 ? 'paid' : index < 25 ? 'new' : 'sent',
          total: new Int32(index * 10),
          createdAt: new Date(Date.UTC(2024, index % 3, 1 + index)),
        })),
      );
  });
});

test.afterAll(async () => {
  await mongo.stop();
  await rm(files, { recursive: true, force: true });
});

test.afterEach(async () => {
  await closeAll(running);
});

function sectionOf(window: Page) {
  return window.getByRole('region', { name: 'Chart' });
}

function chartOf(window: Page) {
  return sectionOf(window).getByRole('img', { name: 'Chart' });
}

function control(window: Page, label: string) {
  return sectionOf(window).getByRole('group', { name: 'Fields and options' }).getByLabel(label, { exact: true });
}

async function showChart(): Promise<StartedApp> {
  const started = await startWithMongo(mongo);
  running.push(started);
  const { window } = started;
  await openCollection(window, 'shop', 'orders');
  await expect(window.getByRole('region', { name: 'Documents' })).toBeVisible();
  await window.locator('[data-feature="chart.show@section-bar"]').click();
  await expect(sectionOf(window)).toBeVisible();
  return started;
}

async function drawStatus(window: Page): Promise<void> {
  await control(window, 'Category').fill('status');
  await control(window, 'Category').press('Enter');
  await expect(chartOf(window)).toBeVisible();
  await expect(sectionOf(window).getByRole('status')).toContainText('3 categories');
}

/** The color of the top left pixel of the chart, as `rgb(r, g, b)`. */
async function cornerColor(window: Page): Promise<string> {
  return chartOf(window).evaluate((canvas) => {
    const pixel = (canvas as HTMLCanvasElement).getContext('2d')?.getImageData(1, 1, 1, 1).data ?? [];
    return `rgb(${String(pixel[0])}, ${String(pixel[1])}, ${String(pixel[2])})`;
  });
}

/** The island color of the theme shown, as the browser computes it. */
async function islandColor(window: Page): Promise<string> {
  return window.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.color = 'var(--color-island)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
}

test.describe('chart.show', () => {
  test('first shows Bar, count and Top 20, sends nothing, then draws one bar per status with Enter', async () => {
    test.setTimeout(120_000);
    const { window } = await showChart();
    const section = sectionOf(window);
    await expect(section.getByRole('button', { name: 'Bar', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(control(window, 'Value')).toHaveValue('count');
    await expect(control(window, 'Top')).toHaveValue('20');
    await expect(section).toContainText('Choose the fields of the chart, then Draw.');
    await expect(section.locator('[data-feature="chart.save-picture@toolbar"]')).toBeDisabled();
    await drawStatus(window);
    await expect(section.locator('[data-feature="chart.save-picture@toolbar"]')).toBeEnabled();
    await bothThemes(window);
  });

  test('shows the field of the value only when it is not count; Pie and Histogram show their own controls', async () => {
    test.setTimeout(120_000);
    const { window } = await showChart();
    await drawStatus(window);
    await expect(control(window, 'Field of the value')).toHaveCount(0);
    await control(window, 'Value').selectOption('sum');
    await expect(control(window, 'Field of the value')).toBeVisible();
    await sectionOf(window).getByRole('button', { name: 'Pie', exact: true }).click();
    await expect(control(window, 'Series')).toHaveCount(0);
    await expect(control(window, 'Unit of the dates')).toHaveCount(0);
    await sectionOf(window).getByRole('button', { name: 'Histogram', exact: true }).click();
    const labels = sectionOf(window).getByRole('group', { name: 'Fields and options' }).locator('label');
    await expect(labels).toHaveText(['Field', 'Bins']);
  });

  test('Data reads Pipeline coming from Aggregate, and Filter coming from Find', async () => {
    test.setTimeout(120_000);
    const { window } = await showChart();
    const data = sectionOf(window).getByRole('group', { name: 'Data' });
    await expect(data.getByRole('button', { name: 'Filter' })).toHaveAttribute('aria-pressed', 'true');
    await window.locator('[data-feature="table.show@section-bar"]').click();
    await barOf(window).locator('button[data-feature="query.mode@query-bar"]').click();
    await window.getByRole('menuitemcheckbox', { name: 'Aggregate' }).click();
    await window.locator('[data-feature="chart.show@section-bar"]').click();
    await expect(data.getByRole('button', { name: 'Pipeline' })).toHaveAttribute('aria-pressed', 'true');
    await expect(data).toContainText('Aggregate: no stages');
  });

  test('draws again in the light theme when the theme changes from dark', async () => {
    test.setTimeout(120_000);
    const { window } = await showChart();
    await window.emulateMedia({ colorScheme: 'dark' });
    await drawStatus(window);
    await expect.poll(() => cornerColor(window)).toBe(await islandColor(window));
    const dark = await cornerColor(window);
    await window.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => cornerColor(window)).not.toBe(dark);
    await expect.poll(() => cornerColor(window)).toBe(await islandColor(window));
  });

  test('keeps the type, the fields and the options after the tab is closed and reopened', async () => {
    test.setTimeout(120_000);
    const { window } = await showChart();
    await sectionOf(window).getByRole('button', { name: 'Line', exact: true }).click();
    await control(window, 'Category').fill('createdAt');
    await control(window, 'Unit of the dates').selectOption('month');
    await expect(chartOf(window)).toBeVisible();
    await window.keyboard.press('Control+w');
    await expect(sectionOf(window)).toBeHidden();
    await window.keyboard.press('Control+Shift+T');
    await window.locator('[data-feature="chart.show@section-bar"]').click();
    await expect(sectionOf(window).getByRole('button', { name: 'Line', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(control(window, 'Category')).toHaveValue('createdAt');
    await expect(control(window, 'Unit of the dates')).toHaveValue('month');
  });
});

test.describe('chart.filter-from-mark', () => {
  test('a click on the bar paid shows the documents of that bar, as many as it counts', async () => {
    test.setTimeout(120_000);
    const { window } = await showChart();
    await drawStatus(window);
    const chart = chartOf(window);
    await expect(chart).toHaveAttribute('data-feature', 'chart.filter-from-mark@chart');
    const box = await chart.boundingBox();
    if (box === null) {
      throw new Error('The chart is not shown.');
    }
    // The bars are in the order of their counts: paid, the largest, is the first one, from the left of the axis.
    await window.mouse.click(box.x + 40 + (box.width - 40) / 6, box.y + box.height * 0.75);
    await expect(window.getByRole('region', { name: 'Documents' })).toBeVisible();
    await expect.poll(() => editorText(window, 'Filter')).toBe('{ status: "paid" }');
    await expect(documentRows(window)).toHaveCount(15);
    await window.locator('[data-feature="chart.show@section-bar"]').click();
    await expect(control(window, 'Category')).toHaveValue('status');
  });
});

test.describe('chart.save-picture', () => {
  test('writes a PNG of the chart at the size shown times the scale of the screen', async () => {
    test.setTimeout(120_000);
    const { window, app } = await showChart();
    await drawStatus(window);
    const path = join(files, 'orders-bar.png');
    await app.evaluate(({ dialog }, chosen) => {
      const stubbed = dialog as unknown as Record<string, unknown>;
      stubbed['showSaveDialog'] = (_window: unknown, options: { defaultPath?: string }) =>
        Promise.resolve({ canceled: false, filePath: options.defaultPath?.endsWith('orders-bar.png') ? chosen : '' });
    }, path);
    await sectionOf(window).locator('[data-feature="chart.save-picture@toolbar"]').click();
    await expect(window.getByText(`Saved the chart to ${path}.`, { exact: true })).toBeVisible();
    const written = await readFile(path);
    expect([...written.subarray(1, 4)].map((byte) => String.fromCharCode(byte)).join('')).toBe('PNG');
    const size = await chartOf(window).evaluate((canvas) => ({
      width: Math.round(canvas.getBoundingClientRect().width * globalThis.devicePixelRatio),
      height: Math.round(canvas.getBoundingClientRect().height * globalThis.devicePixelRatio),
    }));
    expect({ width: written.readUInt32BE(16), height: written.readUInt32BE(20) }).toEqual(size);
  });

  test('Save chart as picture… is offered from Go to once a chart is drawn; cancelling writes nothing', async () => {
    test.setTimeout(120_000);
    const { window, app } = await showChart();
    await drawStatus(window);
    await app.evaluate(({ dialog }) => {
      const stubbed = dialog as unknown as Record<string, unknown>;
      stubbed['showSaveDialog'] = () => Promise.resolve({ canceled: true, filePath: '' });
    });
    await goTo(window, 'Save chart as picture…');
    await expect(window.getByText(/^Saved the chart/u)).toHaveCount(0);
  });
});

test.describe('codegen.show', () => {
  test('Code in the Chart section shows the code of the aggregation of the chart', async () => {
    test.setTimeout(120_000);
    const { window } = await showChart();
    await drawStatus(window);
    await sectionOf(window).getByRole('button', { name: 'Code', exact: true }).click();
    const code = window.getByRole('region', { name: 'Code' });
    await expect(code).toContainText('Code · orders · bar chart');
    await expect(code.locator('pre')).toContainText('$limit');
  });
});
