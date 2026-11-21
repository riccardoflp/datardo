/**
 * What the runner needs from the rest of the main process, given to it at start: the features by identifier, the
 * engines, the actions of the app, the window's dialogs and the state. The runner knows no feature by name
 * (architecture, "Who may use whom").
 */
import type { Answers, AppStep, FileStep, RunnableFeature, Platform } from '../shared/feature';
import type { ConnectionRequest, Json, RedisRequest } from '../shared/engine-request';
import type { ConnectionId, FeatureId } from '../shared/ids';
import type { Question } from '../shared/question';
import type { AppEvent, AppState } from '../shared/state';
import type { Confirmation } from '../shared/state/runner';

/** Carries out requests to the engines: the only way the runner reaches a deployment (R5.1). */
export interface Engines {
  /** Sends one request on its connection and returns the reply; `signal` cancels the wait. */
  readonly send: (request: ConnectionRequest, signal: AbortSignal) => Promise<unknown>;
}

/**
 * What a step that takes long says of how far it is, in its item of work in progress (`runner.progress`): its title,
 * and the words of its progress in place of the steps done (`logo.png (1 of 3) · 1.2 MB of 4.5 MB`).
 */
export type StepProgress = (said: { readonly title?: string; readonly detail?: string }) => void;

/** Carries out an app step or answers an app read: `window.set-zoom`, `settings.set`. */
export type AppAction = (args: Json, signal: AbortSignal, progress?: StepProgress) => Promise<unknown>;

/** Carries out a file step. */
export type FileWriter = (step: FileStep, signal: AbortSignal, progress?: StepProgress) => Promise<void>;

/** Opens a question or a confirmation in the window and waits for its answer; `undefined` means cancelled. */
export interface Dialogs {
  readonly ask: (feature: FeatureId, question: Question) => Promise<Answers | undefined>;
  readonly confirm: (feature: FeatureId, confirmation: Confirmation) => Promise<boolean>;
  /** Closes, as cancelled, the dialogs a feature has open: a playground's run stopped while a drop waits. */
  readonly dismiss?: (feature: FeatureId) => void;
}

/** The app's state, read and changed only through events (R3.3). */
export interface StateHolder {
  readonly get: () => AppState;
  readonly dispatch: (event: AppEvent) => void;
}

/**
 * The clients the events of redis-oplog are sent with (`oplog.publish`): one per MongoDB connection, to its linked
 * Redis connection, opened on first use and kept. Errors hold no secret of the linked connection.
 */
export interface OplogClients {
  /** Sends the commands, as one pipeline, through the client of the MongoDB connection; fails after 5 seconds. */
  readonly send: (mongo: ConnectionId, linked: ConnectionId, requests: readonly RedisRequest[]) => Promise<void>;
  /** What must never show in a warning: the linked connection's connection string and password. */
  readonly secrets: (linked: ConnectionId) => readonly string[];
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
  /** Where the events of redis-oplog go; nothing is published without it. */
  readonly oplog?: OplogClients;
}

/** An app step, as the runner carries it out. */
export type { AppStep };
