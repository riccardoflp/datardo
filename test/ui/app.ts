/**
 * Starts the built application for a UI test, with its data folder in a temporary folder and a fixed window size
 * (testing.md, "Determinism").
 */
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A started Datardo, its first window and its data folder. */
export interface StartedApp {
  readonly app: ElectronApplication;
  readonly window: Page;
  readonly dataFolder: string;
  readonly close: () => Promise<void>;
}

/**
 * The first window of a started Datardo. It behaves as the window in front even when another program is (Chromium's
 * focus emulation), so that the tests of the focus do not depend on what else happens on the desktop.
 */
export async function firstWindow(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow();
  const session = await window.context().newCDPSession(window);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  return window;
}

/**
 * Why a test that finds saved secrets at the next start is skipped: Playwright starts Electron with
 * `--password-store=basic`, which on Linux is no keychain, so Datardo keeps the secrets in memory only (D26).
 */
export const noKeychain = 'No keychain: on Linux Playwright starts Electron with --password-store=basic (D26).';

/** Whether Datardo writes the secrets it is given, so that it has them at its next start (D26). */
export async function keepsSecrets(window: Page): Promise<boolean> {
  return window.evaluate(async () => {
    const bridge = (globalThis as unknown as { datardo: { state: () => Promise<unknown> } }).datardo;
    const state = (await bridge.state()) as { connections: { keychain: boolean } };
    return state.connections.keychain;
  });
}

/** Starts Datardo from `out/`, as `npm run build` wrote it. */
export async function startApp(environment: Readonly<Record<string, string>> = {}): Promise<StartedApp> {
  const dataFolder = await mkdtemp(join(tmpdir(), 'datardo-ui-'));
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      // A test never asks GitHub for a newer version: the address of the check is one where nothing answers.
      DATARDO_TEST_UPDATE_ADDRESS: 'http://127.0.0.1:9/',
      ...environment,
      DATARDO_DATA: dataFolder,
      DATARDO_TEST: '1',
    },
  });
  const window = await firstWindow(app);
  await window.setViewportSize({ width: 1440, height: 900 });
  return {
    app,
    window,
    dataFolder,
    close: async () => {
      await app.close();
      await rm(dataFolder, { recursive: true, force: true });
    },
  };
}

/** The rules of R10.5: WCAG 2.2 levels A and AA, as far as axe-core covers them. */
const accessibilityTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Runs the accessibility check of R10.5 on what the window shows. AxeBuilder's own run opens a second page, which
 * Electron does not allow, so axe-core is evaluated in the window itself.
 */
export async function expectAccessible(window: Page, disabledRules: readonly string[] = []): Promise<void> {
  // A read in progress dims what it leaves shown (R10.8): the check is of the page once its reads have come, which on a
  // loaded machine can take longer than the 200 ms before the dimming.
  await expect(window.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  const source = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
  await window.evaluate(source);
  const violations = await window.evaluate(
    async ({ tags, disabled }) => {
      const axe = (globalThis as unknown as { axe: AxeRunner }).axe;
      const rules = Object.fromEntries(disabled.map((rule) => [rule, { enabled: false }]));
      const results = await axe.run(document, { runOnly: { type: 'tag', values: tags }, rules });
      return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
    },
    { tags: accessibilityTags, disabled: [...disabledRules] },
  );
  expect(violations).toEqual([]);
}

interface AxeRunner {
  run: (
    context: Document,
    options: { runOnly: { type: 'tag'; values: string[] }; rules: Record<string, { enabled: boolean }> },
  ) => Promise<{ violations: { id: string; help: string }[] }>;
}
