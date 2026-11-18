/**
 * The feature contract in types (feature-contract.md): what a feature is given, what it returns, and the plan the
 * runner carries out. Every card of the catalog is a function of one of these shapes.
 */
import type { ConnectionRequest, Json } from './engine-request';
import type { ConnectionId, FeatureId, Place, RefusalCode } from './ids';
import type { Question } from './question';
import type { AppState } from './state';
import type { Target } from './target';

/** The systems Datardo runs on. */
export type Platform = 'windows' | 'macos' | 'linux';

/** Who started a feature: a person in the window, a tool of the MCP server, or a scheduled task. */
export type StartedBy = 'user' | 'mcp' | 'task';

/**
 * The immutable snapshot a feature is given (feature-contract.md, "How a feature runs"). A feature never reads the
 * clock, the environment, a global or a server: what it needs is here, or it asks for a read.
 */
export interface Context {
  readonly feature: FeatureId;
  /** The time, in milliseconds since 1970 (UTC). */
  readonly now: number;
  readonly platform: Platform;
  readonly startedBy: StartedBy;
  /** Where the control that started it is, when a control did. */
  readonly place?: Place;
  /** What the feature was started on. */
  readonly target: Target;
  /** The app's state when the feature was started, settings included. */
  readonly state: AppState;
}

/** The answers to the questions and the results of the reads a feature asked for, by their keys. */
export type Answers = Readonly<Record<string, unknown>>;

/** A read a feature asks for before it can decide: a Read feature's request, its result under `key`. */
export interface ReadNeed {
  readonly key: string;
  readonly read: FeatureId;
  readonly args: Json;
}

/** What a feature returns each time it is called (feature-contract.md, "The four kinds"). */
export type Outcome =
  | { readonly kind: 'ask'; readonly question: Question }
  | { readonly kind: 'read'; readonly need: ReadNeed }
  | { readonly kind: 'refuse'; readonly code: RefusalCode; readonly message: string }
  | { readonly kind: 'run'; readonly plan: Plan };

/** How dangerous a plan is: what the runner asks before it runs it. */
export type Danger =
  | { readonly kind: 'none' }
  | { readonly kind: 'confirm'; readonly text: string; readonly button: string }
  | { readonly kind: 'destructive'; readonly text: string; readonly button: string; readonly name: string };

/** What the undo history keeps before the steps, or why the plan cannot be undone. */
export type Undo = { readonly keeps: Json } | { readonly cannot: string };

/** What happens when a step fails (D31): stop the plan, go on, or run other steps instead. */
export type OnFailure =
  | { readonly kind: 'stop' }
  | { readonly kind: 'go-on' }
  | { readonly kind: 'instead'; readonly steps: readonly Step[]; readonly codes?: readonly (string | number)[] };

/** What all steps have. */
interface StepBase {
  /** The text of the step, as `runner.step-text` writes it: what the confirmation shows and the Log records. */
  readonly text: string;
  /** What happens when it fails; the plan stops when it is absent. */
  readonly onFailure?: OnFailure;
  /** The title of the group of steps it belongs to; a failure stops its group only (D31). */
  readonly group?: string;
}

/** A command to an engine. `writes` says whether it changes the deployment, which the read-only guard reads. */
export interface EngineStep extends StepBase, ConnectionRequest {
  readonly kind: 'engine';
  readonly writes: boolean;
}

/** A change to a file the user chose. */
export interface FileStep extends StepBase {
  readonly kind: 'file';
  readonly action: 'write' | 'delete' | 'create-folder';
  readonly path: string;
  /** What to write, built by the main process from the plan: the name of a writer and its arguments. */
  readonly content?: { readonly writer: string; readonly args: Json };
}

/** A change to Datardo's own data, or an action of the app: `save the connection Local`, `set the zoom to 110%`. */
export interface AppStep extends StepBase {
  readonly kind: 'app';
  /** The name of the action the main process carries out, `area.verb`: `window.set-zoom`. */
  readonly action: string;
  readonly args: Json;
}

/** The only way a feature changes anything. */
export type Step = EngineStep | FileStep | AppStep;

/** A button of a notification: the feature it starts, on what, with what (`runner.notify`). */
export interface NotificationAction {
  /** The text of the button: **Undo**, **Download**, **Reconnect**. */
  readonly label: string;
  /** The button's identifier, when its feature's card lists the place `@notification`. */
  readonly element?: string;
  readonly feature: FeatureId;
  readonly target: Target;
  readonly args?: Json;
}

/** What the runner does once the steps have run, or once a read started by the user has answered. */
export type After =
  | {
      readonly kind: 'notify';
      readonly level: 'info' | 'success' | 'warning' | 'error';
      readonly text: string;
      /** Up to two buttons (`runner.notify`). */
      readonly actions?: readonly NotificationAction[];
      /** What **Details** shows. */
      readonly details?: string;
    }
  | { readonly kind: 'refresh'; readonly connection?: ConnectionId }
  /** Starts another feature on a target, with the arguments it is started with (`Intent.args`). */
  | { readonly kind: 'start'; readonly feature: FeatureId; readonly target: Target; readonly args?: Json }
  | { readonly kind: 'copy'; readonly text: string }
  /** Shows a page of the app in the main island, at a part of it (a group of the Settings page, a line of the Log). */
  | { readonly kind: 'open'; readonly page: string; readonly at?: string }
  /** Writes a line in the Log and shows nothing. */
  | { readonly kind: 'log'; readonly text: string }
  /** Keeps a value until Datardo quits, in `state.runner.remembered`, under the identifier of a feature. */
  | { readonly kind: 'remember'; readonly key: string; readonly value: Json };

/** What a feature asks the runner to carry out (feature-contract.md, the interface Plan). */
export interface Plan {
  /** As the confirmation, the Log and the undo history show it. */
  readonly title: string;
  readonly steps: readonly Step[];
  readonly danger: Danger;
  /** How much it touches, as the confirmation shows it, counted with the steps' own filter: `3 documents`. */
  readonly touches?: string;
  readonly undo: Undo;
  /** For a write to MongoDB documents: whether redis-oplog hears of it. */
  readonly publishes: boolean;
  readonly after: readonly After[];
}

/** An Operation: something the user does that changes something. */
export interface OperationFeature {
  readonly kind: 'operation';
  readonly id: FeatureId;
  readonly plan: (context: Context, answers: Answers) => Outcome;
}

/** What a Read sends: to an engine, or to Datardo's own data (an app read the main process answers). */
export type ReadRequest =
  | { readonly kind: 'engine'; readonly requests: readonly ConnectionRequest[] }
  | { readonly kind: 'app'; readonly action: string; readonly args: Json };

/** A Read: asks something and returns it, changing nothing. */
export interface ReadFeature {
  readonly kind: 'read';
  readonly id: FeatureId;
  readonly request: (context: Context, args: Json) => ReadRequest | Outcome;
  readonly parse: (replies: readonly unknown[], args: Json) => unknown;
  /** What follows when the user (not another feature) started the read: a notification, a line in the Log. */
  readonly after?: (result: unknown, context: Context) => readonly After[];
}

/** A feature the runner can start by its identifier. */
export type RunnableFeature = OperationFeature | ReadFeature;

/** A refusal, with its code written whole where it is raised: `refuse('document.delete/read-only', …)` (R4.2). */
export function refuse(code: string, message: string): Outcome {
  return { kind: 'refuse', code: code as RefusalCode, message };
}

/** A question to the user. */
export function ask(question: Question): Outcome {
  return { kind: 'ask', question };
}

/** A read the feature needs, whose result comes back under `key`. */
export function needRead(key: string, read: string, args: Json = null): Outcome {
  return { kind: 'read', need: { key, read: read as FeatureId, args } };
}

/** A plan to run. */
export function run(plan: Plan): Outcome {
  return { kind: 'run', plan };
}

/** The danger of a plan that runs at once. */
export const noDanger: Danger = { kind: 'none' };
