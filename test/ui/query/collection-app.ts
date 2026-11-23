/**
 * What the UI tests of a collection tab share: a MongoDB server seeded by the test file, a Datardo started with its
 * data in a temporary folder and a connection to that server, and a collection tab opened as the tree opens one
 * (`tab.open`). Each test closes every Datardo it started, even when it fails.
 */
import { expect, type Page } from '@playwright/test';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { expectAccessible, startApp, type StartedApp } from '../app';

/** A MongoDB server for one test file. */
export interface TestMongo {
  readonly uri: () => string;
  readonly start: (seed: (db: (name: string) => Db) => Promise<void>) => Promise<void>;
  readonly stop: () => Promise<void>;
  /** Runs something against the server, as another client would. */
  readonly use: <T>(action: (db: (name: string) => Db) => Promise<T>) => Promise<T>;
}

/** A MongoDB server started by `start` with its seed and stopped by `stop`. */
export function testMongo(): TestMongo {
  let server: MongoMemoryServer | undefined;
  const use = async <T>(action: (db: (name: string) => Db) => Promise<T>): Promise<T> => {
    const client = new MongoClient(server?.getUri() ?? '');
    await client.connect();
    try {
      return await action((name) => client.db(name));
    } finally {
      await client.close();
    }
  };
  return {
    uri: () => server?.getUri() ?? '',
    start: async (seed) => {
      const binary = process.env['MONGOMS_SYSTEM_BINARY'];
      server = await MongoMemoryServer.create(
        binary === undefined || binary === '' ? {} : { binary: { systemBinary: binary } },
      );
      await use(seed);
    },
    stop: async () => {
      await server?.stop();
    },
    use,
  };
}

/** Starts a feature through the bridge, as a control of the window does. */
export async function startIntent(window: Page, feature: string, args: unknown, target?: unknown): Promise<unknown> {
  return window.evaluate(
    async ({ id, given, at }) => {
      const bridge = (globalThis as unknown as { datardo: { start: (intent: unknown) => Promise<unknown> } }).datardo;
      return bridge.start({ feature: id, target: at ?? { kind: 'app' }, args: given });
    },
    { id: feature, given: args, at: target },
  );
}

/** Adds the connection *Local* to the server and connects it. */
export async function addMongo(window: Page, uri: string): Promise<void> {
  await startIntent(window, 'connection.add', 'mongodb');
  const form = window.getByRole('form', { name: 'New connection' });
  await form.locator('[data-field="name"]').fill('Local');
  await form.locator('[data-field="connection-string"]').fill(uri);
  await form.getByRole('button', { name: 'Save and connect' }).click();
  await expect(form).toBeHidden();
}

/** The identifier of the first saved connection. */
export async function firstConnection(window: Page): Promise<string> {
  return window.evaluate(async () => {
    const bridge = (
      globalThis as unknown as {
        datardo: { state: () => Promise<{ connections: { saved: readonly { id: string }[] } }> };
      }
    ).datardo;
    const state = await bridge.state();
    return state.connections.saved[0]?.id ?? '';
  });
}

/** Opens the tab of a collection, as the tree does. */
export async function openCollection(window: Page, database: string, collection: string, view = false): Promise<void> {
  const connection = await firstConnection(window);
  await startIntent(window, 'tab.open', {
    shows: { kind: 'collection', connection, database, collection, ...(view ? { view: true } : {}) },
  });
}

/** A Datardo started with the connection *Local* to the server. */
export async function startWithMongo(
  mongo: TestMongo,
  environment: Readonly<Record<string, string>> = {},
): Promise<StartedApp> {
  const started = await startApp(environment);
  await expect(started.window.getByRole('navigation', { name: 'Rail' })).toBeVisible();
  await addMongo(started.window, mongo.uri());
  return started;
}

/** The accessibility check of R10.5 in both themes. */
export async function bothThemes(window: Page): Promise<void> {
  for (const theme of ['light', 'dark']) {
    await window.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
    await expectAccessible(window);
  }
}

/** The documents section of the active collection tab. */
export function documentsOf(window: Page) {
  return window.getByRole('region', { name: 'Documents' });
}

/** The query bar of the active collection tab. */
export function barOf(window: Page) {
  return window.getByRole('search');
}

/** A field of the query bar by the name a screen reader says: `Filter`. */
export function fieldOf(window: Page, name: string) {
  return barOf(window).getByRole('textbox', { name, exact: true });
}

/** The text of an editor of the bar, its lines joined, without its placeholder. */
export async function editorText(window: Page, name: string): Promise<string> {
  return fieldOf(window, name).evaluate((content) =>
    [...content.querySelectorAll('.cm-line')]
      .map((line) => {
        const copy = line.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('.cm-placeholder').forEach((each) => {
          each.remove();
        });
        return copy.textContent;
      })
      .join('\n'),
  );
}

/** Replaces the text of an editor of the bar, as a paste does. */
export async function setEditor(window: Page, name: string, text: string): Promise<void> {
  await fieldOf(window, name).click();
  await window.keyboard.press('Control+A');
  if (text === '') {
    await window.keyboard.press('Delete');
  } else {
    await window.keyboard.insertText(text);
  }
}

/** What the table drags: a cell with its value, or a column header. */
export type TestDragged =
  | { readonly kind: 'cell'; readonly field: string; readonly value: unknown; readonly within?: string }
  | { readonly kind: 'header'; readonly field: string; readonly within?: string };

/** Starts a drag of something of the table over the query bar, as the table's drag would, with its data. */
export async function dragOverBar(window: Page, dragged: TestDragged): Promise<void> {
  await barOf(window).evaluate((bar, carried) => {
    const transfer = new DataTransfer();
    transfer.setData('application/x-datardo-drag', JSON.stringify(carried));
    bar.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, dragged);
}

/** Drops what is dragged on a zone of the bar, found by its label over the field `data-field`. */
export async function dropOnZone(window: Page, field: string, label: string, dragged: TestDragged): Promise<void> {
  const zone = barOf(window).locator(`div[data-field="${field}"] [data-zone="${label}"]`);
  await zone.evaluate((target, carried) => {
    const transfer = new DataTransfer();
    transfer.setData('application/x-datardo-drag', JSON.stringify(carried));
    for (const type of ['dragenter', 'dragover', 'drop']) {
      target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }
  }, dragged);
}

/** Ends a drag outside every zone, as letting go elsewhere or `Esc` does. */
export async function endDragOutside(window: Page): Promise<void> {
  await window.evaluate(() => {
    globalThis.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
  });
}

/** The documents of the page in the grid: one row number per document, whatever its sub-rows. */
export function documentRows(window: Page) {
  return documentsOf(window).getByRole('grid').locator('tbody td[data-pos$=":0:0"]');
}
