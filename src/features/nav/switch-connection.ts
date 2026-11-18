/**
 * Feature: nav.switch-connection
 *
 * The connection switcher lists every saved connection by folder; choosing one makes it the current connection, makes
 * its last active tab active or opens its Overview, and connects it when it is not connected, without waiting.
 */
import {
  ask,
  run,
  type After,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { currentOf } from './current-connection';
import { text } from './text';
import {
  appPlan,
  appStep,
  findConnection,
  navInput,
  startArgs,
  type ConnectionStatus,
  type NavInput,
  type SavedConnection,
} from './types';

/** How the dot of a connection is drawn, from its state. */
export type Dot = 'filled' | 'ring' | 'turning' | 'turning-warning' | 'error';

/** The dot of a connection in a given state. */
export function dotOf(status: ConnectionStatus): Dot {
  switch (status.kind) {
    case 'connected':
      return 'filled';
    case 'not-connected':
      return 'ring';
    case 'connecting':
      return 'turning';
    case 'reconnecting':
      return 'turning-warning';
    case 'failed':
      return 'error';
  }
}

/** A row of the switcher. */
export interface SwitcherRow {
  readonly connection: SavedConnection;
  readonly engine: string;
  readonly dot: Dot;
  readonly current: boolean;
}

/** A group of rows: the connections in no folder have no heading. */
export interface SwitcherGroup {
  readonly folder?: string;
  readonly rows: readonly SwitcherRow[];
}

/** The switcher with a filter typed: its groups, or the line that says why it lists nothing. */
export interface SwitcherView {
  readonly placeholder: string;
  readonly groups: readonly SwitcherGroup[];
  readonly empty?: string;
  readonly add: { readonly label: string; readonly element: 'connection.add@connection-switcher' };
}

function matches(connection: SavedConnection, filter: string): boolean {
  const typed = filter.trim().toLowerCase();
  const words = [connection.name, connection.folder ?? '', text.engines[connection.engine]];
  return typed === '' || words.some((word) => word.toLowerCase().includes(typed));
}

/** The connections by folder: those in no folder first, then the folders by name, each in the order saved. */
export function switcherGroups(
  connections: readonly SavedConnection[],
  current: SavedConnection | undefined,
  filter: string,
): readonly SwitcherGroup[] {
  const row = (connection: SavedConnection): SwitcherRow => ({
    connection,
    engine: text.engines[connection.engine],
    dot: dotOf(connection.status),
    current: connection.id === current?.id,
  });
  const kept = connections.filter((connection) => matches(connection, filter));
  const loose = kept.filter((connection) => connection.folder === undefined);
  const folders = [...new Set(kept.flatMap((connection) => connection.folder ?? []))].sort((one, other) =>
    one.localeCompare(other),
  );
  const groups: SwitcherGroup[] = loose.length === 0 ? [] : [{ rows: loose.map(row) }];
  for (const folder of folders) {
    groups.push({ folder, rows: kept.filter((connection) => connection.folder === folder).map(row) });
  }
  return groups;
}

/** The connection switcher, with the filter typed. */
export function switcherView(input: NavInput, filter: string): SwitcherView {
  const groups = switcherGroups(input.connections, currentOf(input), filter);
  const add = { label: text.connection.addConnection, element: 'connection.add@connection-switcher' } as const;
  const base = { placeholder: text.switcher.filter, groups, add };
  if (input.connections.length === 0) {
    return { ...base, empty: text.switcher.none };
  }
  return groups.length === 0 ? { ...base, empty: text.switcher.noMatch(filter) } : base;
}

function chosen(input: NavInput, answers: Answers): SavedConnection | undefined {
  const asked = answers['connection'] ?? startArgs(answers)['connection'];
  return typeof asked === 'string' ? input.connections.find((connection) => connection.id === asked) : undefined;
}

/** The plan for the nav input given. */
export function planFor(input: NavInput, answers: Answers): Outcome {
  const connection = chosen(input, answers);
  if (connection === undefined) {
    const choices = switcherGroups(input.connections, currentOf(input), '').flatMap((group) =>
      group.rows.map((row) => ({ value: row.connection.id, label: row.connection.name, description: row.engine })),
    );
    const current = currentOf(input)?.id;
    const field = { kind: 'pick-one', key: 'connection', label: text.switcher.which, choices } as const;
    return ask({
      title: text.switcher.question,
      button: text.switcher.button,
      fields: [current === undefined ? field : { ...field, default: current }],
    });
  }
  const title = `Switch to ${connection.name}`;
  if (connection.id === findConnection(input.connections, currentOf(input)?.id)?.id) {
    return run(appPlan(title, []));
  }
  const made = appStep(`make ${connection.name} the current connection`, 'nav.make-current', {
    connection: connection.id,
  });
  const last = [...input.tabs]
    .filter((tab) => tab.connection === connection.id)
    .sort((one, other) => other.lastActive - one.lastActive)[0];
  const next =
    last === undefined
      ? appStep(`open Overview of ${connection.name}`, 'connection.overview', { connection: connection.id })
      : appStep(`make the tab ${last.title} active`, 'tab.activate', { tab: last.id });
  const after: After[] =
    connection.status.kind === 'not-connected'
      ? [
          {
            kind: 'start',
            feature: featureId('connection.connect'),
            target: { kind: 'connection', connection: connection.id },
          },
        ]
      : [];
  return run(appPlan(title, [made, next], after));
}

/** Makes another connection current: `args.connection`, or the one the user picks when none is given. */
export function plan(context: Context, answers: Answers): Outcome {
  return planFor(navInput(context.state), answers);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('nav.switch-connection'), plan };
