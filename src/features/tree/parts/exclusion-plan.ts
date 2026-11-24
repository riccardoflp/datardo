/**
 * What `tree.exclude-from-searches` is started on, as the menus of the tree and of a connection give it, and the plan
 * of its one app step, which writes the connection's entry of the saved connections (`tree.excluded`).
 */
import type { ConnectionView } from '../../../shared/connection';
import { noDanger, run, type AppStep, type Outcome } from '../../../shared/feature';
import { exclusionKey, exclusionOf, type ExclusionTarget } from '../excluded';
import { text } from '../text';
import { isObject, type NodeRef } from '../types';

/** A database, a collection or a view, or a bucket, as the arguments of the feature name it. */
export interface ExclusionNode {
  readonly database: string;
  readonly collection?: string;
  /** A view, which the step names `the view`. */
  readonly view?: true;
  readonly bucket?: string;
}

/** What the entry does: leave out of searches, or put back. */
export type ExclusionAction = 'exclude' | 'include';

/** The node of the arguments of a node of the tree: a database, a collection, a view or a bucket; none otherwise. */
export function exclusionNodeOf(node: NodeRef): ExclusionNode | undefined {
  switch (node.kind) {
    case 'database':
      return { database: node.database };
    case 'collection':
      return {
        database: node.database,
        collection: node.name,
        ...(node.collectionKind === 'view' ? { view: true } : {}),
      };
    case 'bucket':
      return { database: node.database, bucket: node.name };
    case 'redis-database':
    case 'namespace':
    case 'empty-databases':
    case 'pin':
    case 'page':
    case 'heading':
      return undefined;
  }
}

/** What an exclusion is looked up for, for a node. */
export function targetOfExclusionNode(node: ExclusionNode): Exclude<ExclusionTarget, { kind: 'connection' }> {
  if (node.bucket !== undefined) {
    return { kind: 'bucket', database: node.database, bucket: node.bucket };
  }
  return node.collection === undefined
    ? { kind: 'database', database: node.database }
    : { kind: 'collection', database: node.database, collection: node.collection };
}

/** The nodes of the arguments, `nodes: [{ database, collection?, view?, bucket? }]`; those that are not, left out. */
export function exclusionNodesOf(value: unknown): readonly ExclusionNode[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return (value as readonly unknown[]).flatMap((each): ExclusionNode[] => {
    if (!isObject(each) || typeof each['database'] !== 'string' || each['database'] === '') {
      return [];
    }
    const { database, collection, bucket } = each;
    return [
      {
        database,
        ...(typeof collection === 'string' && collection !== '' ? { collection } : {}),
        ...(each['view'] === true ? { view: true } : {}),
        ...(typeof bucket === 'string' && bucket !== '' ? { bucket } : {}),
      },
    ];
  });
}

/** How the step names a node: `the database archive`, `the collection shop.logs`, `the GridFS bucket media.fs`. */
function wordsOf(node: ExclusionNode): string {
  if (node.bucket !== undefined) {
    return text.exclusions.bucket(node.database, node.bucket);
  }
  if (node.collection === undefined) {
    return text.exclusions.database(node.database);
  }
  const namespace = `${node.database}.${node.collection}`;
  return node.view === true ? text.exclusions.view(namespace) : text.exclusions.collection(namespace);
}

/** The order of the step: databases, then collections and views, then buckets, each by its key. */
function orderOf(node: ExclusionNode): number {
  return node.bucket !== undefined ? 2 : node.collection === undefined ? 0 : 1;
}

function sorted(nodes: readonly ExclusionNode[]): readonly ExclusionNode[] {
  const keyOf = (node: ExclusionNode): string => exclusionKey(targetOfExclusionNode(node));
  return [...nodes].sort((one, other) => {
    const by = orderOf(one) - orderOf(other);
    return by !== 0 ? by : keyOf(one) < keyOf(other) ? -1 : keyOf(one) > keyOf(other) ? 1 : 0;
  });
}

/** Whether a node has an entry of its own. */
export function isOwnExcluded(connection: ConnectionView, node: ExclusionNode): boolean {
  return exclusionOf(connection, targetOfExclusionNode(node)) === 'own';
}

function planOf(action: ExclusionAction, steps: readonly AppStep[]): Outcome {
  return run({
    title: action === 'exclude' ? text.menu.excludeFromSearches : text.menu.includeInSearches,
    steps,
    danger: noDanger,
    undo: { cannot: text.exclusions.cannotUndo[action] },
    publishes: false,
    after: [],
  });
}

/**
 * The plan of one app step that adds the keys of the nodes to `exclusions`, or removes them: only the nodes it
 * changes are in the step, and with none there is nothing to do.
 */
export function nodesPlan(
  connection: ConnectionView,
  nodes: readonly ExclusionNode[],
  action: ExclusionAction,
): Outcome {
  const changed = sorted(nodes.filter((node) => isOwnExcluded(connection, node) === (action === 'include')));
  const keys = [...new Set(changed.map((node) => exclusionKey(targetOfExclusionNode(node))))];
  const words = changed.map(wordsOf);
  const step: AppStep = {
    kind: 'app',
    action: 'tree.exclude-from-searches',
    args: { connection: connection.id, keys, excluded: action === 'exclude' },
    text:
      action === 'exclude'
        ? text.exclusions.exclude(connection.name, words)
        : text.exclusions.include(connection.name, words),
  };
  return planOf(action, changed.length === 0 ? [] : [step]);
}

/** The plan of one app step that writes `excluded: true` on the connection, or removes it. */
export function connectionPlan(connection: ConnectionView, action: ExclusionAction): Outcome {
  const unchanged = (connection.excluded === true) === (action === 'exclude');
  const step: AppStep = {
    kind: 'app',
    action: 'tree.exclude-from-searches',
    args: { connection: connection.id, excluded: action === 'exclude' },
    text:
      action === 'exclude'
        ? text.exclusions.excludeConnection(connection.name)
        : text.exclusions.includeConnection(connection.name),
  };
  return planOf(action, unchanged ? [] : [step]);
}
