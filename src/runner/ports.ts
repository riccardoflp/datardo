/**
 * What the runner needs from the rest of the main process, given to it at start: the features by identifier, the
 * engines, the actions of the app, the window's dialogs and the state. The runner knows no feature by name
 * (architecture, "Who may use whom").
 */
import type { Answers, AppStep, FileStep, RunnableFeature, Platform } from '../shared/feature';
import type { ConnectionRequest, Json } from '../shared/engine-request';
import type { ConnectionId, FeatureId } from '../shared/ids';
import type { Question } from '../shared/question';
import type { AppEvent, AppState } from '../shared/state';
import type { Confirmation } from '../shared/state/runner';

/** Carries out requests to the engines: the only way the runner reaches a deployment (R5.1). */
export interface Engines {
  /** Sends one request on its connection and returns the reply; `signal` cancels the wait. */
  readonly send: (request: ConnectionRequest, signal: AbortSignal) => Promise<unknown>;
}

/** Carries out an app step or answers an app read: `window.set-zoom`, `settings.set`. */
export type AppAction = (args: Json, signal: AbortSignal) => Promise<unknown>;

/** Carries out a file step. */
export type FileWriter = (step: FileStep, signal: AbortSignal) => Promise<void>;

/** Opens a question or a confirmation in the window and waits for its answer; `undefined` means cancelled. */
export interface Dialogs {
  readonly ask: (feature: FeatureId, question: Question) => Promise<Answers | undefined>;
  readonly confirm: (feature: FeatureId, confirmation: Confirmation) => Promise<boolean>;
}

/** The app's state, read and changed only through events (R3.3). */
export interface StateHolder {
  readonly get: () => AppState;
  readonly dispatch: (event: AppEvent) => void;
}

/** Everything the runner is given. */
export interface RunnerPorts {
  readonly features: ReadonlyMap<FeatureId, RunnableFeature>;
  readonly engines: Engines;
  readonly appActions: ReadonlyMap<string, AppAction>;
  readonly files: FileWriter;
  readonly dialogs: Dialogs;
  readonly state: StateHolder;
  readonly platform: Platform;
  /** Whether a connection is read-only as it is now (D14): the guard asks it before every step that writes. */
  readonly isReadOnly: (connection: ConnectionId) => boolean;
  /** The name of a connection, for the messages. */
  readonly connectionName: (connection: ConnectionId) => string;
  /** Whether a MongoDB collection is a view, which nothing writes to; none is until connections exist (M6). */
  readonly isView?: (connection: ConnectionId, database: string, collection: string) => boolean;
  /** Whether a connection is connected now; every one is taken as connected until connections exist (M6). */
  readonly isConnected?: (connection: ConnectionId) => boolean;
  readonly now: () => number;
}

/** An app step, as the runner carries it out. */
export type { AppStep };
