/**
 * Starts the built application for the window area's UI tests. Unlike `startApp`, the data folder is given, so that a
 * test can start Datardo twice on the same folder (`window.remember`, `window.single-instance`); and no update check
 * reaches GitHub. Every Datardo started here is closed by {@link closeAll}, which each test file calls after each test
 * whether it passed or not, so that none outlives its test.
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** How long a Datardo is given to quit before it is ended. */
const quitWaitMs = 10_000;

/** The environment of a test run, on the data folder given. */
export function testEnvironment(dataFolder: string): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    DATARDO_DATA: dataFolder,
    DATARDO_TEST: '1',
    // Nothing listens there: the check fails quietly instead of asking GitHub.
    DATARDO_TEST_UPDATE_ADDRESS: 'http://127.0.0.1:9/',
  };
}

/** A new, empty data folder. */
export async function newDataFolder(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'datardo-ui-window-'));
}

/** Removes a data folder. */
export async function removeDataFolder(dataFolder: string): Promise<void> {
  await rm(dataFolder, { recursive: true, force: true });
}

/** A started Datardo and its window. */
export interface Launched {
  readonly app: ElectronApplication;
  readonly window: Page;
}

/** The Datardos started by the test running now, and the other processes it started. */
const running = new Set<ElectronApplication>();
const children = new Set<ChildProcess>();

/** Starts Datardo on a data folder and waits for its window to show the top bar. */
export async function launch(dataFolder: string): Promise<Launched> {
  const app = await electron.launch({ args: ['.'], env: testEnvironment(dataFolder) });
  running.add(app);
  const window = await app.firstWindow();
  await window.locator('header').first().waitFor();
  return { app, window };
}

/** Records a process a test started itself, so that {@link closeAll} ends it if the test did not. */
export function track(child: ChildProcess): ChildProcess {
  children.add(child);
  return child;
}

function end(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill();
  }
}

/** Quits a Datardo, and ends its process when it has not quit in time. */
export async function quit(app: ElectronApplication): Promise<void> {
  running.delete(app);
  const process = app.process();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, quitWaitMs);
  });
  await Promise.race([app.close().catch(() => undefined), late]);
  clearTimeout(timer);
  end(process);
}

/** Quits every Datardo the test started and ends the processes it started: after each test, passed or not. */
export async function closeAll(): Promise<void> {
  const apps = [...running];
  await Promise.all(apps.map(quit));
  for (const child of children) {
    end(child);
  }
  children.clear();
}

/** Gives the window a size, as the user would by dragging its edge. */
export async function resize(app: ElectronApplication, width: number, height: number): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setSize(size.width, size.height);
    },
    { width, height },
  );
}
