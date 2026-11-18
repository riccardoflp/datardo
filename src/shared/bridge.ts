/**
 * The messages between the window process and the main process (R6.5). The window reaches the main process only
 * through the object the bridge exposes, whose type is {@link Bridge}; every call is asynchronous (R10.6).
 *
 * Everything the window does goes through {@link Bridge.start}: an intent names a feature and what it was started on,
 * and the runner carries it out (architecture, "From an action to its effect"). The main process sends back the events
 * that change the app's state, which the window reduces into its mirror of it.
 */
import type { Answers } from './feature';
import type { Json } from './engine-request';
import type { FeatureId, Place, QuestionId, RefusalCode, WorkId } from './ids';
import type { AppEvent, AppState } from './state';
import type { Target } from './target';

/** The name of the IPC channel of each call of the bridge. */
export const bridgeChannel = {
  ping: 'datardo:ping',
  state: 'datardo:state',
  start: 'datardo:start',
  answer: 'datardo:answer',
  cancel: 'datardo:cancel',
  dismiss: 'datardo:dismiss',
  clearLog: 'datardo:clear-log',
  exportLog: 'datardo:export-log',
  event: 'datardo:event',
} as const;

/** What the main process answers to a ping: that it runs, and which Datardo it is. */
export interface PingReply {
  readonly name: 'Datardo';
  readonly version: string;
}

/** A feature to start, what it was started on, and from where. */
export interface Intent {
  readonly feature: FeatureId;
  readonly target: Target;
  readonly place?: Place;
  /** The arguments of a Read, or what an Operation is started with (the text typed, the value picked). */
  readonly args?: Json;
}

/** How a feature that was started ended, as the control that started it learns it. */
export type IntentResult =
  | { readonly kind: 'done' }
  | { readonly kind: 'read'; readonly result: unknown }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'refused'; readonly code: RefusalCode; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string; readonly details?: string };

/** The answer to a question or a confirmation the runner opened; `undefined` cancels it. */
export interface DialogAnswer {
  readonly id: QuestionId;
  readonly answers: Answers | undefined;
}

/** Something the window closes for good: a notification, or an item of work that failed (`runner.progress`). */
export interface Dismissal {
  readonly kind: 'notification' | 'work';
  readonly id: string;
}

/** How **Export…** of the Log ended: written to a file, or the user chose none. */
export type ExportResult = { readonly kind: 'written'; readonly path: string } | { readonly kind: 'cancelled' };

/** The object the bridge exposes to the window process as `window.datardo`. */
export interface Bridge {
  /** Asks the main process whether it answers. */
  readonly ping: () => Promise<PingReply>;
  /** The app's state as the main process holds it now. */
  readonly state: () => Promise<AppState>;
  /** Starts a feature; resolves when it has ended. */
  readonly start: (intent: Intent) => Promise<IntentResult>;
  /** Answers, or cancels, what the runner opened in the window. */
  readonly answer: (answer: DialogAnswer) => Promise<void>;
  /** Cancels work in progress (`runner.cancel`). */
  readonly cancel: (work: WorkId) => Promise<void>;
  /** Closes a notification, or an item of work that failed. */
  readonly dismiss: (dismissal: Dismissal) => Promise<void>;
  /** **Clear** of the Log (`runner.log`): empties it, after no confirmation. */
  readonly clearLog: () => Promise<void>;
  /** **Export…** of the Log (`runner.log`): asks the system for a file and writes the lines shown to it. */
  readonly exportLog: (text: string) => Promise<ExportResult>;
  /** Calls `listener` with every event of the app's state; returns what stops it. */
  readonly onEvent: (listener: (event: AppEvent) => void) => () => void;
}

/** Whether a value received from the other process is a {@link PingReply}. */
export function isPingReply(value: unknown): value is PingReply {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const reply = value as Record<string, unknown>;
  return reply['name'] === 'Datardo' && typeof reply['version'] === 'string';
}
