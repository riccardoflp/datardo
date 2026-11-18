/**
 * The part of the app's state the runner keeps: the questions and confirmations open in the window, the
 * notifications, the work in progress and the lines of the Log. The cards of the runner area (M3) say what each holds
 * and shows.
 */
import type { Json } from '../engine-request';
import type { Danger, NotificationAction } from '../feature';
import type { ConnectionId, FeatureId, QuestionId, WorkId } from '../ids';
import type { Question } from '../question';

/** One step as the confirmation shows it: its text, and what happens when it fails, when the step says (D31). */
export interface ConfirmStep {
  /** As `runner.step-text` writes it. */
  readonly text: string;
  /** The title of the group of steps it belongs to. */
  readonly group?: string;
  /** The steps run in its place when it fails, shown under it as *if this fails:*. */
  readonly instead?: readonly string[];
  /** The plan goes on when it fails. */
  readonly goOn?: boolean;
}

/** A confirmation of a plan, as `runner.confirm` shows it. */
export interface Confirmation {
  readonly title: string;
  readonly danger: Exclude<Danger, { kind: 'none' }>;
  /** How much the plan touches: `3 documents`. */
  readonly touches?: string;
  readonly steps: readonly ConfirmStep[];
  /** The line `undo.note` gives. */
  readonly undoLine: string;
}

/** What the runner has open in the window and waits for an answer to. The first is shown, the others wait. */
export type OpenDialog =
  | { readonly kind: 'question'; readonly id: QuestionId; readonly feature: FeatureId; readonly question: Question }
  | {
      readonly kind: 'confirmation';
      readonly id: QuestionId;
      readonly feature: FeatureId;
      readonly confirmation: Confirmation;
    };

/** The kinds of notifications (`runner.notify`). */
export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

/** A notification at the bottom right of the window (`runner.notify`). */
export interface Notification {
  readonly id: string;
  readonly level: NotificationLevel;
  readonly text: string;
  readonly feature?: FeatureId;
  /** The code of a refusal, or the original text of an error, shown under **Details**. */
  readonly details?: string;
  /** Up to two buttons. */
  readonly actions?: readonly NotificationAction[];
  /** How many times the same message arrived within 30 seconds (*×3*). */
  readonly count: number;
  readonly time: number;
  /** The line of the Log that holds it, for **Show in log**. */
  readonly logLine?: number;
}

/** One item of work in progress (`runner.progress`). */
export interface Work {
  readonly id: WorkId;
  readonly feature: FeatureId;
  readonly title: string;
  readonly started: number;
  readonly connection?: ConnectionId;
  readonly done?: number;
  readonly total?: number;
  /** What `done` and `total` count: `documents`. */
  readonly unit?: string;
  /** Why it cannot be cancelled, said in place of **Cancel**: *Already sent to the server.* */
  readonly cannotCancel?: string;
  /** It was cancelled and stops at the end of what is in progress. */
  readonly cancelled?: boolean;
  /** It failed: it stays, with its error, until dismissed. */
  readonly error?: string;
}

/** The kinds of lines of the Log. */
export type LogKind = 'step' | 'outcome' | 'refusal' | 'error' | 'notification' | 'info';

/** One line of the Log (`runner.log`). */
export interface LogLine {
  /** Its number in this run, from 1: what **Show in log** finds. */
  readonly id: number;
  readonly time: number;
  /** The identifier of the feature, or **MCP**, **Tasks**, **Playground**, **Console**. */
  readonly source: string;
  readonly connection?: string;
  readonly kind: LogKind;
  readonly text: string;
}

/** A line of the Log before the reducer numbers it. */
export type NewLogLine = Omit<LogLine, 'id'>;

/** A page of the app asked for, and the part of it to show (`runner.log` at a line, `settings.page` at a group). */
export interface OpenedPage {
  readonly page: string;
  readonly at?: string;
  /** Counts the requests, so that asking twice for the same place scrolls to it again. */
  readonly times: number;
}

/** What the runner keeps. */
export interface RunnerState {
  readonly dialogs: readonly OpenDialog[];
  readonly notifications: readonly Notification[];
  readonly work: readonly Work[];
  readonly log: readonly LogLine[];
  /** How many lines were written in this run, cleared or not: the number of the next one, less one. */
  readonly logged: number;
  /** What features asked to keep until Datardo quits, by key (`window.check-update` keeps the newer version). */
  readonly remembered: Readonly<Record<string, Json>>;
  /** The last page asked for with a part of it to show. */
  readonly opened?: OpenedPage;
  /** Counts the plans that asked the open pages to read again, with the connection they wrote to. */
  readonly refreshed: { readonly times: number; readonly connection?: ConnectionId };
}

/** The events of this part of the state. */
export type RunnerEvent =
  | { readonly slice: 'runner'; readonly type: 'dialog-opened'; readonly dialog: OpenDialog }
  | { readonly slice: 'runner'; readonly type: 'dialog-closed'; readonly id: QuestionId }
  | { readonly slice: 'runner'; readonly type: 'notified'; readonly notification: Notification }
  | { readonly slice: 'runner'; readonly type: 'notification-closed'; readonly id: string }
  | { readonly slice: 'runner'; readonly type: 'work-started'; readonly work: Work }
  | {
      readonly slice: 'runner';
      readonly type: 'work-progressed';
      readonly id: WorkId;
      readonly done: number;
      readonly total?: number;
    }
  | { readonly slice: 'runner'; readonly type: 'work-changed'; readonly id: WorkId; readonly work: Partial<Work> }
  | { readonly slice: 'runner'; readonly type: 'work-ended'; readonly id: WorkId }
  | { readonly slice: 'runner'; readonly type: 'logged'; readonly lines: readonly NewLogLine[] }
  | { readonly slice: 'runner'; readonly type: 'log-cleared' }
  | { readonly slice: 'runner'; readonly type: 'remembered'; readonly key: string; readonly value: Json }
  | { readonly slice: 'runner'; readonly type: 'page-opened'; readonly page: string; readonly at?: string }
  | { readonly slice: 'runner'; readonly type: 'refresh-asked'; readonly connection?: ConnectionId };

/** The Log keeps the last 5,000 lines (`runner.log`, Datardo's choice). */
export const logLimit = 5000;

/** The notifications kept in the state; the window shows the last 3 of those not closed. */
export const notificationLimit = 50;

/** Nothing open, nothing running, an empty Log. */
export const initialRunnerState: RunnerState = {
  dialogs: [],
  notifications: [],
  work: [],
  log: [],
  logged: 0,
  remembered: {},
  refreshed: { times: 0 },
};

/** Changes this part of the state. */
export function reduceRunner(state: RunnerState, event: RunnerEvent): RunnerState {
  switch (event.type) {
    case 'dialog-opened':
      return { ...state, dialogs: [...state.dialogs, event.dialog] };
    case 'dialog-closed':
      return { ...state, dialogs: state.dialogs.filter((dialog) => dialog.id !== event.id) };
    case 'notified':
      return { ...state, notifications: withNotification(state.notifications, event.notification) };
    case 'notification-closed':
      return { ...state, notifications: state.notifications.filter((item) => item.id !== event.id) };
    case 'work-started':
      return { ...state, work: [...state.work.filter((work) => work.id !== event.work.id), event.work] };
    case 'work-progressed':
      return {
        ...state,
        work: state.work.map((work) => (work.id === event.id ? progressed(work, event.done, event.total) : work)),
      };
    case 'work-changed':
      return { ...state, work: state.work.map((work) => (work.id === event.id ? { ...work, ...event.work } : work)) };
    case 'work-ended':
      return { ...state, work: state.work.filter((work) => work.id !== event.id) };
    case 'logged':
      return logged(state, event.lines);
    case 'log-cleared':
      return { ...state, log: [] };
    case 'remembered':
    case 'page-opened':
    case 'refresh-asked':
      return reduceRest(state, event);
  }
}

function reduceRest(
  state: RunnerState,
  event: Extract<RunnerEvent, { type: 'remembered' | 'page-opened' | 'refresh-asked' }>,
): RunnerState {
  switch (event.type) {
    case 'remembered':
      return { ...state, remembered: { ...state.remembered, [event.key]: event.value } };
    case 'page-opened': {
      const times = (state.opened?.times ?? 0) + 1;
      return {
        ...state,
        opened: event.at === undefined ? { page: event.page, times } : { page: event.page, at: event.at, times },
      };
    }
    case 'refresh-asked': {
      const times = state.refreshed.times + 1;
      return {
        ...state,
        refreshed: event.connection === undefined ? { times } : { times, connection: event.connection },
      };
    }
  }
}

function withNotification(list: readonly Notification[], notification: Notification): readonly Notification[] {
  return [...list.filter((item) => item.id !== notification.id), notification].slice(-notificationLimit);
}

function logged(state: RunnerState, lines: readonly NewLogLine[]): RunnerState {
  const numbered = lines.map((line, index) => ({ ...line, id: state.logged + index + 1 }));
  return { ...state, log: [...state.log, ...numbered].slice(-logLimit), logged: state.logged + lines.length };
}

function progressed(work: Work, done: number, total: number | undefined): Work {
  return total === undefined ? { ...work, done } : { ...work, done, total };
}
