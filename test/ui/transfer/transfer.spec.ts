/**
 * Export and import driven through the window (M25): **Export** of the table's toolbar asks the format and which
 * results, then the system's save dialog, writes the file and ends with **Open** and **Reveal**; **Export 2 documents…**
 * of the selection bar writes the selected rows only; an import asks the file, shows what it inserts before it runs,
 * and inserts it. The system's dialogs are answered in the main process; the files are written in a temporary folder.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { StartedApp } from '../app';
import { bothThemes, documentsOf, firstConnection, startIntent, testMongo } from '../query/collection-app';
import { cellAt, closeAll, seedPeople, startOnPeople } from '../table/parts-app';

const mongo = testMongo();
const running: StartedApp[] = [];
let folder = '';

test.beforeAll(async () => {
  test.setTimeout(180_000);
  folder = await mkdtemp(join(tmpdir(), 'datardo-ui-m25-'));
  await seedPeople(mongo);
});

test.afterAll(async () => {
  await mongo.stop();
  await rm(folder, { recursive: true, force: true });
});

test.afterEach(async () => {
  await closeAll(running);
});

/** The answers of the system's dialogs, given in the main process before the feature opens them. */
async function answerDialogs(app: ElectronApplication, paths: { open?: string; save?: string }): Promise<void> {
  await app.evaluate(({ dialog }, chosen) => {
    const replaced = dialog as unknown as Record<string, unknown>;
    replaced['showOpenDialog'] = () =>
      Promise.resolve({
        canceled: chosen.open === undefined,
        filePaths: chosen.open === undefined ? [] : [chosen.open],
      });
    replaced['showSaveDialog'] = () => Promise.resolve({ canceled: chosen.save === undefined, filePath: chosen.save });
  }, paths);
}

/** Picks a choice of the question open, by its label, and presses its button. */
async function pick(window: Page, title: string, choice: RegExp, button = 'Choose'): Promise<void> {
  const dialog = window.getByRole('dialog', { name: title });
  await dialog.getByRole('radio', { name: choice }).check();
  await dialog.getByRole('button', { name: button }).click();
}

function lines(text: string): string[] {
  return text.split('\n').filter((line) => line !== '');
}

test.describe('transfer.export', () => {
  test('Export of the toolbar: the format, all results, the save dialog, then Open and Reveal; in both themes', async () => {
    test.setTimeout(120_000);
    const { window, app } = await startOnPeople(mongo, running);
    const file = join(folder, 'people.jsonl');
    await answerDialogs(app, { save: file });
    await documentsOf(window).locator('[data-feature="transfer.export@toolbar"]').click();
    const formats = window.getByRole('dialog', { name: 'Export people' });
    await expect(formats.getByRole('radio')).toHaveCount(3);
    await bothThemes(window);
    await pick(window, 'Export people', /^JSON Lines/u);
    await pick(window, 'Export people as JSON Lines', /^All results/u);
    const done = window.getByText('Exported 3 documents to people.jsonl.', { exact: true });
    await expect(done).toBeVisible();
    await expect(window.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Reveal', exact: true })).toBeVisible();
    const written = lines(await readFile(file, 'utf8')).map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(written.map((each) => each['name'])).toEqual(['Ada', 'Bob', 'Cy']);
    expect(written[0]?.['score']).toEqual({ $numberInt: '42' });
  });

  test('Open hands a .json export to its program, and only shows one saved as orders.html in its folder', async () => {
    test.setTimeout(120_000);
    const { window, app } = await startOnPeople(mongo, running);
    await app.evaluate(({ shell }) => {
      const stubbed = shell as unknown as Record<string, unknown>;
      const calls: string[] = [];
      (globalThis as unknown as { shellCalls: string[] }).shellCalls = calls;
      stubbed['showItemInFolder'] = (shown: string) => calls.push(`show ${shown}`);
      stubbed['openPath'] = (opened: string) => {
        calls.push(`open ${opened}`);
        return Promise.resolve('');
      };
    });
    const calls = (): Promise<string[]> =>
      app.evaluate(() => (globalThis as unknown as { shellCalls: string[] }).shellCalls);
    for (const [name, call] of [
      ['orders.json', 'open'],
      ['orders.html', 'show'],
    ] as const) {
      const file = join(folder, name);
      await answerDialogs(app, { save: file });
      await documentsOf(window).locator('[data-feature="transfer.export@toolbar"]').click();
      await pick(window, 'Export people', /^JSON(?! Lines)/u);
      await pick(window, 'Export people as JSON', /^All results/u);
      await expect(window.getByText(`Exported 3 documents to ${name}.`, { exact: true })).toBeVisible();
      await window.getByRole('button', { name: 'Open', exact: true }).click();
      await expect.poll(calls).toContain(`${call} ${file}`);
    }
    expect(await calls()).toEqual([`open ${join(folder, 'orders.json')}`, `show ${join(folder, 'orders.html')}`]);
  });

  test('Export 2 documents… of the selection bar writes the selected rows only, with the columns shown', async () => {
    test.setTimeout(120_000);
    const { window, app } = await startOnPeople(mongo, running);
    const file = join(folder, 'selected.csv');
    await answerDialogs(app, { save: file });
    await cellAt(window, 0, 0).click();
    await cellAt(window, 2, 0).click({ modifiers: ['Control'] });
    await window
      .getByRole('toolbar', { name: 'Selection' })
      .getByRole('button', { name: 'Export 2 documents…' })
      .click();
    await pick(window, 'Export people', /^CSV/u);
    await expect(window.getByText('Exported 2 documents to selected.csv.', { exact: true })).toBeVisible();
    const csv = await readFile(file, 'utf8');
    expect(csv.startsWith('﻿_id,name,')).toBe(true);
    expect(lines(csv.replace('﻿', '').replaceAll('\r', ''))).toHaveLength(3);
    expect(csv).toContain('Ada');
    expect(csv).toContain('Cy');
    expect(csv).not.toContain('Bob');
  });

  test('a closed save dialog writes nothing and says nothing', async () => {
    test.setTimeout(120_000);
    const { window, app } = await startOnPeople(mongo, running);
    await answerDialogs(app, {});
    await documentsOf(window).locator('[data-feature="transfer.export@toolbar"]').click();
    await pick(window, 'Export people', /^JSON(?! Lines)/u);
    await pick(window, 'Export people as JSON', /^Current page/u);
    await expect(window.getByRole('dialog')).toHaveCount(0);
    await expect(window.getByText(/^Exported/u)).toHaveCount(0);
  });
});

test.describe('transfer.import', () => {
  test('asks the file, shows what it inserts before it runs, and inserts it; the keyboard confirms', async () => {
    test.setTimeout(120_000);
    const { window, app } = await startOnPeople(mongo, running);
    const file = join(folder, 'more.jsonl');
    await writeFile(file, '{"_id":{"$numberInt":"10"},"name":"Dee"}\n{"name":"Eve"}\n');
    await answerDialogs(app, { open: file });
    const connection = await firstConnection(window);
    const target = { kind: 'collection', connection, database: 'shop', collection: 'people' };
    const result = startIntent(window, 'transfer.import', {}, target);
    const confirmation = window.getByRole('dialog', { name: /Import/u });
    await expect(confirmation).toContainText('Import 2 documents from more.jsonl into shop.people?');
    await bothThemes(window);
    await confirmation.getByRole('button', { name: 'Import', exact: true }).focus();
    await window.keyboard.press('Enter');
    expect(await result).toEqual({ kind: 'done' });
    await expect(window.getByText('Imported 2 of 2 documents into people.', { exact: true })).toBeVisible();
    const names = await mongo.use((db) =>
      db('shop')
        .collection('people')
        .find({ name: { $in: ['Dee', 'Eve'] } })
        .toArray(),
    );
    expect(names).toHaveLength(2);
    await mongo.use((db) =>
      db('shop')
        .collection('people')
        .deleteMany({ name: { $in: ['Dee', 'Eve'] } }),
    );
  });
});
