/**
 * The check for a newer version in the main process (`window.check-update`): the request itself, the only one Datardo
 * sends to the network by itself (R14.9), and the timer that starts the check 10 seconds after the window shows,
 * then every 24 hours, and at once when `datardo.window.checkForUpdates` is turned on.
 *
 * In a test run (`DATARDO_TEST=1`) and only then, `DATARDO_TEST_UPDATE_ADDRESS` replaces the address of the request,
 * so that a server of the test answers it and no test reaches GitHub; `DATARDO_TEST_UPDATE_DELAY_MS` shortens the
 * wait after the window shows.
 */
import { app, type BrowserWindow } from 'electron';
import type { AppAction } from '../runner/ports';
import { setting } from '../features/settings/read';
import type { ReleaseReply, ReleaseRequest } from '../features/window/check-update';
import type { Json } from '../shared/engine-request';
import { featureId } from '../shared/ids';
import { appTarget } from '../shared/target';
import type { AppState } from '../shared/state';
import { whenRunnerReady } from './bridge';
import type { MainServices } from './services';
import { start as startFeature } from '../runner/start';

/** The first check, 10 seconds after the window shows (Datardo's choice). */
export const firstCheckAfterMs = 10_000;

/** Then every 24 hours (Datardo's choice). */
export const checkEveryMs = 24 * 60 * 60 * 1000;

/** The address of the request in a test run, read only when `DATARDO_TEST=1`. */
export function testAddress(): string | undefined {
  return process.env['DATARDO_TEST'] === '1' ? process.env['DATARDO_TEST_UPDATE_ADDRESS'] : undefined;
}

function firstDelay(): number {
  const asked = process.env['DATARDO_TEST'] === '1' ? Number(process.env['DATARDO_TEST_UPDATE_DELAY_MS']) : Number.NaN;
  return Number.isFinite(asked) && asked >= 0 ? asked : firstCheckAfterMs;
}

/** Sends `GET` to the address with `Accept` and `User-Agent` and nothing else, and reads at most 1 MB of the reply. */
export const fetchLatestRelease: AppAction = async (args: Json, signal: AbortSignal) => {
  const asked = args as unknown as ReleaseRequest;
  const url = testAddress() ?? asked.url;
  if (url === null || url === '') {
    return { kind: 'no-request' } satisfies ReleaseReply;
  }
  const limit = AbortSignal.any([signal, AbortSignal.timeout(asked.timeLimitMs)]);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': asked.userAgent },
      credentials: 'omit',
      redirect: 'follow',
      signal: limit,
    });
    const body = await readAtMost(response, asked.largestReplyBytes);
    if (body === undefined) {
      return { kind: 'error', reason: 'too-large' } satisfies ReleaseReply;
    }
    return { kind: 'reply', status: response.status, body } satisfies ReleaseReply;
  } catch (error: unknown) {
    // The check fails without a word unless the user asked: the reason is all that is kept of the error.
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return { kind: 'error', reason: timedOut ? 'timed-out' : 'network' } satisfies ReleaseReply;
  }
};

async function readAtMost(response: Response, largest: number): Promise<string | undefined> {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return '';
  }
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > largest) {
      await reader.cancel();
      return undefined;
    }
    parts.push(value);
  }
  return Buffer.concat(parts).toString('utf8');
}

/** Starts the check by itself, as the user would start it with **Check for updates**, but saying nothing when it fails. */
async function checkByItself(): Promise<void> {
  const ports = await whenRunnerReady();
  await startFeature(ports, {
    feature: featureId('window.check-update'),
    target: appTarget,
    args: { by: 'start' },
  });
}

function isOn(state: AppState): boolean {
  return setting(state.settings, 'datardo.window.checkForUpdates');
}

/** Starts the timer: the first check after the window shows, then every 24 hours, each only while the setting is on. */
export function start(services: MainServices): Promise<void> {
  const check = (): void => {
    if (isOn(services.state.get())) {
      void checkByItself();
    }
  };
  app.once('browser-window-created', (_event, window: BrowserWindow) => {
    window.once('show', () => {
      setTimeout(() => {
        check();
        setInterval(check, checkEveryMs);
      }, firstDelay());
    });
  });
  let wasOn = isOn(services.state.get());
  services.state.listen((event, state) => {
    if (event.slice !== 'settings') {
      return;
    }
    const on = isOn(state);
    if (on && !wasOn) {
      void checkByItself();
    }
    wasOn = on;
  });
  return Promise.resolve();
}
