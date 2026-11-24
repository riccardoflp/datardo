/**
 * Feature: nav.status-line
 *
 * The row at the bottom of the window: the current connection and its state, what the active page counts, the work in
 * progress, the scheduled tasks running, the zoom and whether the current connection is read-only. Each part is there only when it has something
 * to say.
 */
import type { WorkId } from '../../shared/ids';
import type { Work } from '../../shared/state/runner';
import { currentOf } from './current-connection';
import { isSlow, latencyOf, latencyText } from './ping';
import { dotOf, type Dot } from './switch-connection';
import { text } from './text';
import type { NavInput, SavedConnection } from './types';

/** The connection part: a button that opens the connection switcher. */
export interface ConnectionPart {
  /** The name and the state: `Local · connected`. */
  readonly text: string;
  /** While connected, the latency `nav.ping` read last (`4 ms`), drawn after the text in a place of its own width. */
  readonly latency?: string;
  readonly dot?: Dot;
  /** Whether the latency is shown in the warning color. */
  readonly slow: boolean;
  /** The reason of a drop, shown when the pointer rests on the part. */
  readonly tooltip?: string;
  readonly element: 'nav.switch-connection@status-line';
}

/** The work in progress: one with its title, how far it is and **Cancel**; several as a number. */
export type WorkPart =
  | {
      readonly kind: 'one';
      readonly work: WorkId;
      readonly title: string;
      readonly progress?: string;
      readonly cancel: string;
      readonly element: 'runner.progress@status-line';
      /** **Cancel** of a playground's run stops it, as **Stop** does (`playground.stop`). */
      readonly cancelElement?: 'playground.stop@status-line';
    }
  | { readonly kind: 'several'; readonly text: string; readonly element: 'runner.progress@status-line' };

/** The status line, from the left. */
export interface StatusLineView {
  readonly label: string;
  readonly connection: ConnectionPart;
  readonly reconnect?: { readonly label: string; readonly element: 'connection.reconnect@status-line' };
  readonly count?: { readonly text: string; readonly element?: 'query.count@status-line' };
  readonly work?: WorkPart;
  /** `1 task running`, which opens the Scheduled tasks page. */
  readonly tasks?: { readonly text: string; readonly element: 'task.show@status-line' };
  readonly zoom?: { readonly text: string; readonly label: string; readonly element: 'window.zoom@status-line' };
  readonly readOnly?: {
    readonly text: string;
    readonly tooltip: string;
    readonly element: 'nav.status-line@status-line';
  };
}

function connectionPart(input: NavInput, current: SavedConnection | undefined): ConnectionPart {
  const element = 'nav.switch-connection@status-line';
  if (current === undefined) {
    return { text: text.statusLine.noConnection, slow: false, element };
  }
  const latency = latencyOf(input, current);
  const connected = current.status.kind === 'connected';
  const shown = connected && input.nav.latency?.connection === current.id ? { latency: latencyText(latency) } : {};
  const tooltip = current.status.kind === 'reconnecting' ? { tooltip: current.status.reason } : {};
  return {
    text: [current.name, text.states[current.status.kind]].join(' · '),
    ...shown,
    dot: dotOf(current.status),
    slow: connected && isSlow(latency),
    element,
    ...tooltip,
  };
}

function progressOf(work: Work): string | undefined {
  if (work.detail !== undefined) {
    return work.detail;
  }
  if (work.total !== undefined && work.total > 0) {
    return `${String(Math.floor(((work.done ?? 0) / work.total) * 100))}%`;
  }
  return work.done === undefined ? undefined : String(work.done);
}

function workPart(work: readonly Work[]): WorkPart | undefined {
  const [first] = work;
  if (first === undefined) {
    return undefined;
  }
  if (work.length > 1) {
    return { kind: 'several', text: text.statusLine.running(work.length), element: 'runner.progress@status-line' };
  }
  const progress = progressOf(first);
  return {
    kind: 'one',
    work: first.id,
    title: first.title,
    ...(progress === undefined ? {} : { progress }),
    cancel: text.statusLine.cancel,
    element: 'runner.progress@status-line',
    ...(first.feature === 'playground.run' ? { cancelElement: 'playground.stop@status-line' as const } : {}),
  };
}

/** The parts of the status line for the nav input given. */
export function view(input: NavInput): StatusLineView {
  const current = currentOf(input);
  const status = current?.status.kind;
  const tab = input.activeTab;
  const work = workPart(input.work);
  return {
    label: text.islands.statusLine,
    connection: connectionPart(input, current),
    ...(status === 'reconnecting' || status === 'failed'
      ? { reconnect: { label: text.connection.reconnect, element: 'connection.reconnect@status-line' } }
      : {}),
    ...(tab.count === undefined
      ? {}
      : {
          count:
            tab.kind === 'collection' ? { text: tab.count, element: 'query.count@status-line' } : { text: tab.count },
        }),
    ...(work === undefined ? {} : { work }),
    ...((input.tasksRunning ?? 0) === 0
      ? {}
      : { tasks: { text: text.statusLine.tasksRunning(input.tasksRunning ?? 0), element: 'task.show@status-line' } }),
    ...(input.zoom === 100
      ? {}
      : {
          zoom: {
            text: `${String(input.zoom)}%`,
            label: text.statusLine.zoomReset,
            element: 'window.zoom@status-line',
          },
        }),
    ...(current?.readOnly === true
      ? {
          readOnly: {
            text: text.connection.readOnly,
            tooltip: text.statusLine.readOnlyTip(current.name),
            element: 'nav.status-line@status-line',
          },
        }
      : {}),
  };
}
