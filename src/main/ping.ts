/**
 * The ping of the current connection (`nav.ping`, `connection.state`): at once when a connection is current and
 * connected, then every 10 seconds, never while the window is minimized or hidden, never on a connection that is not
 * current. Its latency goes to the state; no answer within 5 seconds starts reconnecting. It is not work in progress
 * and writes no Log line, so it is sent here and not through the runner.
 */
import type { Context } from '../shared/feature';
import { featureId, type ConnectionId } from '../shared/ids';
import type { AppEvent, AppState } from '../shared/state';
import { appTarget } from '../shared/target';
import { connectionToPing, parse, pingIntervalMs, pingTimeLimitMs, request } from '../features/nav/ping';
import { navInput } from '../features/nav/types';
import type { AreaStart } from './areas';
import { connectionEngines, dropped } from './connections';
import type { MainServices } from './services';

const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';

function contextOf(state: AppState): Context {
  return { feature: featureId('nav.ping'), now: Date.now(), platform, startedBy: 'user', target: appTarget, state };
}

function windowShown(services: MainServices): boolean {
  const window = services.window();
  return window !== undefined && !window.isDestroyed() && window.isVisible() && !window.isMinimized();
}

/** The connection to ping now: the current one while it is connected. */
function toPing(state: AppState): ConnectionId | undefined {
  return connectionToPing(navInput(state))?.id;
}

function latencyEvents(connection: ConnectionId, milliseconds: number | undefined): readonly AppEvent[] {
  return milliseconds === undefined
    ? [{ slice: 'nav', type: 'changed', nav: { latency: { connection } } }]
    : [
        { slice: 'nav', type: 'changed', nav: { latency: { connection, milliseconds } } },
        { slice: 'connections', type: 'latency', connection, ms: milliseconds },
      ];
}

/** Pings the current connection once; a ping already waiting for its reply is not sent again. */
function pinger(services: MainServices): () => Promise<void> {
  let waiting = false;
  return async () => {
    const state = services.state.get();
    const connection = toPing(state);
    if (waiting || connection === undefined || !windowShown(services)) {
      return;
    }
    const asked = request(contextOf(state), { connection });
    const sent = asked.kind === 'engine' ? asked.requests[0] : undefined;
    if (sent === undefined) {
      return;
    }
    waiting = true;
    const started = performance.now();
    try {
      const answered = parse([await connectionEngines().send(sent, AbortSignal.timeout(pingTimeLimitMs))]);
      const milliseconds = performance.now() - started;
      // A reply after the time limit, or for a connection no longer current, changes nothing.
      if (answered && milliseconds <= pingTimeLimitMs && toPing(services.state.get()) === connection) {
        latencyEvents(connection, milliseconds).forEach(services.state.dispatch);
      }
    } catch (error: unknown) {
      if (toPing(services.state.get()) === connection) {
        latencyEvents(connection, undefined).forEach(services.state.dispatch);
        dropped(connection, error instanceof Error ? error.message : String(error));
      }
    } finally {
      waiting = false;
    }
  };
}

/** Starts the ping: every 10 seconds, and at once when the connection to ping changes. */
export const start: AreaStart = (services) => {
  const ping = pinger(services);
  let pinged = toPing(services.state.get());
  const timer = setInterval(() => void ping(), pingIntervalMs);
  const stop = services.state.listen((_event, state) => {
    const now = toPing(state);
    if (now !== pinged) {
      pinged = now;
      void ping();
    }
  });
  services.onQuit(() => {
    clearInterval(timer);
    stop();
    return Promise.resolve();
  });
  return Promise.resolve();
};
