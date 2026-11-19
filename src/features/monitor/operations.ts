/**
 * Feature: monitor.operations
 *
 * The Operations section of the Monitor page: the server operations in progress, the longest first, with a filter,
 * and **Kill…** on each. `view` says what the toolbar, the table and the inspector island show, from what
 * `monitor.read-operations` read and the choices of the toolbar. **Idle connections** reads again with `$all: true`;
 * **System operations** and the filter only change what is shown. Ported from Mongoster's `src/webview/monitor.ts ›
 * renderOps`.
 */
import type { Json } from '../../shared/engine-request';
import type { PartRead } from './parts/failure';
import type { SectionControl, Tone } from './parts/tiles';
import { clockText, countText, holdsWithoutCase, runningText } from './parts/units';
import type { ServerOperation } from './read-operations';
import { text } from './text';

/** From how many seconds of running a time takes the warning color. */
export const warningSeconds = 5;
/** From how many seconds of running a time takes the danger color. */
export const dangerSeconds = 30;

/** What the section is drawn from. */
export interface OperationsState {
  readonly connection: { readonly id: string; readonly name: string; readonly readOnly: boolean };
  /** What the last read gave, and when; absent before the first read. */
  readonly read?: PartRead<readonly ServerOperation[]>;
  readonly readAt?: number;
  readonly filter: string;
  /** **Running ≥**, in seconds. */
  readonly runningAtLeast: number;
  readonly idle: boolean;
  readonly system: boolean;
  /** The opids whose kill runs now: their **Kill…** is disabled. */
  readonly killing: readonly (number | string)[];
  /** The opid of the selected row. */
  readonly selected?: number | string;
}

/** A row of the table. */
export interface OperationRow {
  readonly opid: string;
  readonly type: string;
  /** *Waiting for a lock*, the tooltip of the lock mark, when it waits for one. */
  readonly lock?: string;
  readonly namespace: string;
  readonly running: { readonly text: string; readonly tone: Tone };
  readonly client: { readonly text: string; readonly tooltip?: string };
  readonly plan: { readonly text: string; readonly highlighted: boolean };
  readonly command: string;
  /** **Kill…** in the row's menu; absent on a read-only connection and without an opid. */
  readonly kill?: SectionControl;
}

/** What the section shows. */
export interface OperationsView {
  readonly toolbar: {
    readonly filter: { readonly placeholder: string; readonly value: string };
    readonly runningAtLeast: { readonly label: string; readonly value: number; readonly step: number };
    readonly idle: { readonly label: string; readonly on: boolean };
    readonly system: { readonly label: string; readonly on: boolean };
    readonly count?: string;
  };
  readonly columns: readonly string[];
  readonly rows: readonly OperationRow[];
  readonly empty?: string;
  readonly error?: string;
  /** The selected operation, whole, with **Kill…** there too. */
  readonly inspector?: { readonly record: Json; readonly kill?: SectionControl };
}

/** Whether an operation is shown by the toolbar's choices. */
export function isShown(operation: ServerOperation, state: OperationsState): boolean {
  if (operation.system && !state.system) {
    return false;
  }
  if ((operation.microseconds ?? 0) / 1_000_000 < state.runningAtLeast) {
    return false;
  }
  const needle = state.filter.trim();
  if (needle === '') {
    return true;
  }
  const haystacks = [
    operation.namespace,
    operation.type,
    operation.client,
    operation.application,
    operation.description,
    operation.command,
    operation.users,
    operation.opid === undefined ? undefined : String(operation.opid),
  ];
  return haystacks.some((haystack) => haystack !== undefined && holdsWithoutCase(haystack, needle));
}

/** The time an operation has run, and its color. */
export function runningOf(operation: ServerOperation): { readonly text: string; readonly tone: Tone } {
  if (!operation.active || operation.microseconds === undefined) {
    return { text: text.operations.idleRunning, tone: 'ordinary' };
  }
  const seconds = operation.microseconds / 1_000_000;
  const tone: Tone = seconds >= dangerSeconds ? 'danger' : seconds >= warningSeconds ? 'warning' : 'ordinary';
  return { text: runningText(operation.microseconds), tone };
}

function killControl(state: OperationsState, operation: ServerOperation, element: string): SectionControl | undefined {
  if (state.connection.readOnly || operation.opid === undefined) {
    return undefined;
  }
  const row = {
    opid: operation.opid,
    type: operation.type,
    namespace: operation.namespace,
    command: operation.command,
    ...(operation.microseconds === undefined ? {} : { microseconds: operation.microseconds }),
  };
  const running = state.killing.includes(operation.opid);
  return {
    label: text.operations.kill,
    element,
    feature: 'monitor.kill-operation',
    args: { connection: state.connection.id, operation: row },
    ...(running ? { disabledBecause: text.operations.kill } : {}),
  };
}

function rowOf(state: OperationsState, operation: ServerOperation): OperationRow {
  const client = [operation.application, operation.client].filter((part) => part !== undefined).join(' · ');
  const kill = killControl(state, operation, 'monitor.kill-operation@row-menu');
  return {
    opid: operation.opid === undefined ? '' : String(operation.opid),
    type: operation.type,
    ...(operation.waitingForLock ? { lock: text.operations.waitingForLock } : {}),
    namespace: operation.namespace,
    running: runningOf(operation),
    client: { text: client, ...(operation.users === undefined ? {} : { tooltip: operation.users }) },
    plan: { text: operation.plan ?? '', highlighted: (operation.plan ?? '').startsWith('COLLSCAN') },
    command: operation.command,
    ...(kill === undefined ? {} : { kill }),
  };
}

function inspectorOf(state: OperationsState, operations: readonly ServerOperation[]): OperationsView['inspector'] {
  const selected = operations.find((each) => each.opid !== undefined && each.opid === state.selected);
  if (selected === undefined) {
    return undefined;
  }
  const kill = killControl(state, selected, 'monitor.kill-operation@inspector');
  return { record: selected.record, ...(kill === undefined ? {} : { kill }) };
}

function emptyOf(state: OperationsState, read: number, shown: number): string | undefined {
  if (state.read?.kind !== 'read') {
    return undefined;
  }
  if (read === 0) {
    return text.operations.nothingRunning;
  }
  return shown === 0 ? text.operations.nothingMatches : undefined;
}

/** Feature: monitor.operations — the toolbar, the rows shown, the empty sentence and the selected operation. */
export function view(state: OperationsState): OperationsView {
  const words = text.operations;
  const operations = state.read?.kind === 'read' ? state.read.value : [];
  const shown = operations.filter((operation) => isShown(operation, state));
  const noun = operations.length === 1 ? words.one : words.many;
  const count =
    state.read?.kind === 'read' && state.readAt !== undefined
      ? words.count(countText(shown.length), countText(operations.length), noun, clockText(state.readAt))
      : undefined;
  const empty = emptyOf(state, operations.length, shown.length);
  const inspector = inspectorOf(state, operations);
  return {
    toolbar: {
      filter: { placeholder: words.filter, value: state.filter },
      runningAtLeast: { label: words.runningAtLeast, value: state.runningAtLeast, step: 0.1 },
      idle: { label: words.idle, on: state.idle },
      system: { label: words.system, on: state.system },
      ...(count === undefined ? {} : { count }),
    },
    columns: Object.values(words.columns),
    rows: shown.map((operation) => rowOf(state, operation)),
    ...(empty === undefined ? {} : { empty }),
    ...(state.read?.kind === 'failed' ? { error: state.read.failure.message } : {}),
    ...(inspector === undefined ? {} : { inspector }),
  };
}
