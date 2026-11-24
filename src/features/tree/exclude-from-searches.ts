/**
 * Feature: tree.exclude-from-searches
 *
 * Leaves a database, a collection, a view or a GridFS bucket, or a whole connection, out of searches, or puts it
 * back. Started from the menu of the tree with `{ connection, action, nodes: [{ database, collection?, view?,
 * bucket? }] }`, from the menu of a connection with `{ connection, action, scope: 'connection' }`, and from Go to on
 * the collection, view or bucket of the active tab, which it excludes, or includes when it is excluded.
 */
import type { ConnectionView } from '../../shared/connection';
import { featureId } from '../../shared/ids';
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { savedConnection } from '../../shared/state/connections';
import { activeTabOf, tabConnectionOf } from '../../shared/state/tabs';
import { connectionId } from '../../shared/ids';
import { argumentsOf, collectionOfShows } from './parts/color-plan';
import {
  connectionPlan,
  exclusionNodesOf,
  isOwnExcluded,
  nodesPlan,
  type ExclusionAction,
  type ExclusionNode,
} from './parts/exclusion-plan';
import { text } from './text';

function nothing(): Outcome {
  return run({
    title: text.menu.excludeFromSearches,
    steps: [],
    danger: noDanger,
    undo: { cannot: text.exclusions.cannotUndo.exclude },
    publishes: false,
    after: [],
  });
}

function connectionOf(context: Context, given: unknown): ConnectionView | undefined {
  const id = typeof given === 'string' ? connectionId(given) : context.state.nav.current;
  return id === undefined ? undefined : savedConnection(context.state.connections, id);
}

/** The collection, view or bucket of the active tab, and its connection: what Go to acts on. */
export function activeTabNode(
  context: Pick<Context, 'state'>,
): { readonly connection: ConnectionView; readonly node: ExclusionNode } | undefined {
  const active = activeTabOf(context.state.tabs);
  const target = active === undefined ? undefined : collectionOfShows(active.shows);
  const id = active === undefined ? undefined : tabConnectionOf(active);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  if (connection?.engine !== 'mongodb' || target === undefined || typeof target.database !== 'string') {
    return undefined;
  }
  switch (target.kind) {
    case 'collection':
      return { connection, node: { database: target.database, collection: target.collection } };
    case 'bucket':
      return { connection, node: { database: target.database, bucket: target.bucket } };
    case 'database':
      return undefined;
  }
}

function actionOf(value: unknown): ExclusionAction | undefined {
  return value === 'exclude' || value === 'include' ? value : undefined;
}

/**
 * Feature: tree.exclude-from-searches — one app step that adds the keys of the nodes to the connection's
 * `exclusions` or removes them, or writes or removes the connection's `excluded`; nothing to do when nothing changes.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = argumentsOf(answers);
  if (args['scope'] === 'connection') {
    const connection = connectionOf(context, args['connection']);
    const action = actionOf(args['action']) ?? (connection?.excluded === true ? 'include' : 'exclude');
    return connection === undefined ? nothing() : connectionPlan(connection, action);
  }
  const nodes = exclusionNodesOf(args['nodes']);
  if (nodes.length > 0) {
    const connection = connectionOf(context, args['connection']);
    const action = actionOf(args['action']) ?? 'exclude';
    return connection?.engine === 'mongodb' ? nodesPlan(connection, nodes, action) : nothing();
  }
  const active = activeTabNode(context);
  if (active === undefined) {
    return nothing();
  }
  const action = isOwnExcluded(active.connection, active.node) ? 'include' : 'exclude';
  return nodesPlan(active.connection, [active.node], action);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('tree.exclude-from-searches'), plan };
