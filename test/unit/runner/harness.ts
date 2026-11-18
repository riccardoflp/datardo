/**
 * Ports of the runner for the unit tests: features, a server that answers or fails as a test says, dialogs that answer
 * as given, and the app's state, kept and reduced as the main process keeps it.
 */
import type { AppAction, RunnerPorts } from '../../../src/runner/ports';
import type { ConnectionRequest } from '../../../src/shared/engine-request';
import { redisCommand } from '../../../src/shared/engine-request';
import { noDanger, type Danger, type EngineStep, type Plan, type RunnableFeature } from '../../../src/shared/feature';
import { connectionId, type FeatureId } from '../../../src/shared/ids';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import type { Confirmation } from '../../../src/shared/state/runner';

/** What a test changes in the ports. */
export interface HarnessOptions {
  readonly features?: readonly RunnableFeature[];
  /** The answers of every question; `undefined` cancels it. */
  readonly answers?: Record<string, unknown> | undefined;
  /** Whether every confirmation is accepted. */
  readonly confirmed?: boolean;
  readonly readOnly?: (connection: string) => boolean;
  readonly connected?: (connection: string) => boolean;
  /** What the server answers to a request, or throws. */
  readonly server?: (request: ConnectionRequest, signal: AbortSignal) => Promise<unknown>;
  readonly appActions?: Readonly<Record<string, AppAction>>;
  readonly state?: AppState;
}

/** The ports, and what they saw. */
export interface Harness {
  readonly ports: RunnerPorts;
  readonly sent: ConnectionRequest[];
  readonly confirmations: Confirmation[];
  readonly questions: unknown[];
  readonly state: () => AppState;
  /** The texts of the Log, in order. */
  readonly log: () => string[];
  /** Moves the time on. */
  readonly advance: (milliseconds: number) => void;
}

/** Ports of the runner for a test. */
export function harness(options: HarnessOptions = {}): Harness {
  let state = options.state ?? initialState;
  let now = 1000;
  const sent: ConnectionRequest[] = [];
  const confirmations: Confirmation[] = [];
  const questions: unknown[] = [];
  const answers = 'answers' in options ? options.answers : {};
  const ports: RunnerPorts = {
    features: new Map<FeatureId, RunnableFeature>((options.features ?? []).map((feature) => [feature.id, feature])),
    engines: {
      send: (request, signal) => {
        sent.push(request);
        return options.server === undefined ? Promise.resolve('OK') : options.server(request, signal);
      },
    },
    appActions: new Map(Object.entries(options.appActions ?? {})),
    files: () => Promise.resolve(),
    dialogs: {
      ask: (_feature, question) => {
        questions.push(question);
        return Promise.resolve(answers as never);
      },
      confirm: (_feature, confirmation) => {
        confirmations.push(confirmation);
        return Promise.resolve(options.confirmed ?? true);
      },
    },
    state: {
      get: () => state,
      dispatch: (event: AppEvent) => {
        state = reduce(state, event);
      },
    },
    platform: 'windows',
    isReadOnly: (connection) => options.readOnly?.(connection) ?? false,
    isConnected: (connection) => options.connected?.(connection) ?? true,
    connectionName: (connection) => (connection === 'local' ? 'Local' : connection),
    now: () => now,
  };
  return {
    ports,
    sent,
    confirmations,
    questions,
    state: () => state,
    log: () => state.runner.log.map((line) => line.text),
    advance: (milliseconds) => {
      now += milliseconds;
    },
  };
}

/** A step that deletes a Redis key on the connection `local`. */
export function delStep(key: string, more: Partial<EngineStep> = {}): EngineStep {
  return {
    kind: 'engine',
    connection: connectionId('local'),
    request: redisCommand(0, 'DEL', key),
    writes: true,
    text: `DEL ${key}`,
    ...more,
  };
}

/** A plan of these steps, with no danger unless one is given. */
export function planOf(title: string, steps: Plan['steps'], danger: Danger = noDanger): Plan {
  return { title, steps, danger, undo: { cannot: 'Nothing is kept.' }, publishes: false, after: [] };
}

/** The key a request deletes. */
export function keyOf(request: ConnectionRequest): string {
  const inner = request.request;
  return inner.engine === 'redis' ? new TextDecoder().decode(inner.command[1]) : '';
}
