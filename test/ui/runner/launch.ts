/**
 * Starts the built application for the UI tests of the runner and the settings, in test mode (`DATARDO_TEST=1`, which
 * adds the test features `test.destroy`, `test.count` and `test.sent` and the test connections), on a new data folder.
 * The check for a newer version asks a local address where nothing listens unless a test says otherwise.
 */
import { _electron as electron, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { expectAccessible, firstWindow } from '../app';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A started Datardo, its window and its data folder. */
export interface Started {
  readonly app: ElectronApplication;
  readonly window: Page;
  readonly dataFolder: string;
  readonly close: () => Promise<void>;
}

/** Starts Datardo; `environment` adds to or replaces the test's variables, `dataFolder` reuses a folder. */
export async function launch(
  environment: Readonly<Record<string, string>> = {},
  dataFolder?: string,
): Promise<Started> {
  const folder = dataFolder ?? (await mkdtemp(join(tmpdir(), 'datardo-ui-runner-')));
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...(process.env as Record<string, string>),
      DATARDO_TEST_UPDATE_ADDRESS: 'http://127.0.0.1:9/',
      ...environment,
      DATARDO_DATA: folder,
      DATARDO_TEST: '1',
    },
  });
  const window = await firstWindow(app);
  await window.setViewportSize({ width: 1440, height: 900 });
  await window.locator('header').first().waitFor();
  return {
    app,
    window,
    dataFolder: folder,
    close: async () => {
      await app.close();
      await rm(folder, { recursive: true, force: true });
    },
  };
}

/** Starts a feature from the window, as a control does, without waiting for its end. */
export async function startFeature(window: Page, feature: string, args?: unknown): Promise<void> {
  await window.evaluate(
    ({ id, given }) => {
      const datardo = (globalThis as unknown as { datardo: { start: (intent: unknown) => Promise<unknown> } }).datardo;
      void datardo.start({ feature: id, target: { kind: 'app' }, ...(given === undefined ? {} : { args: given }) });
    },
    { id: feature, given: args },
  );
}

/** Starts a Read from the window and gives its result. */
export async function read(window: Page, feature: string): Promise<unknown> {
  return window.evaluate(async (id) => {
    const datardo = (globalThis as unknown as { datardo: { start: (intent: unknown) => Promise<unknown> } }).datardo;
    const result = (await datardo.start({ feature: id, target: { kind: 'app' } })) as {
      kind: string;
      result?: unknown;
    };
    return result.result;
  }, feature);
}

/** A notification shown, by its text: the paragraph, not the copy read to a screen reader. */
export function notice(notifications: Locator, text: string | RegExp): Locator {
  return notifications.getByRole('paragraph').filter({ hasText: text });
}

/** The accessibility check of R10.5. */
export async function accessible(window: Page): Promise<void> {
  await expectAccessible(window);
}
