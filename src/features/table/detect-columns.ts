/**
 * Feature: table.detect-columns
 *
 * Works out which columns the table has from the documents it shows, since a collection has no fixed schema: one
 * column per field of the page, `_id` first, sub-documents and arrays of sub-documents expandable into columns.
 */
import type { Json } from '../../shared/engine-request';
import { isSubdocument, type JsonObject } from '../query/mongosh/ejson';
import type { ColumnNode, Document } from './types';

/** A column that is drawn: a leaf of the tree, with the expanded groups it opens and closes, outermost first. */
export interface Leaf {
  readonly node: ColumnNode;
  readonly starts: readonly string[];
  readonly ends: readonly string[];
}

function hasFields(value: Json | undefined): boolean {
  return isSubdocument(value) && Object.keys(value).length > 0;
}

function hasSubdocumentElements(value: Json | undefined): boolean {
  return Array.isArray(value) && value.some((element: Json) => hasFields(element));
}

/** The sub-documents at a path, looking inside the elements of arrays. */
function objectsAt(documents: readonly Document[], path: readonly string[]): JsonObject[] {
  let current: readonly Json[] = documents;
  for (const segment of path) {
    const next: Json[] = [];
    for (const value of current) {
      if (!isSubdocument(value) || !Object.hasOwn(value, segment)) {
        continue;
      }
      const inner = value[segment] as Json;
      if (Array.isArray(inner)) {
        next.push(...(inner as readonly Json[]));
      } else {
        next.push(inner);
      }
    }
    current = next;
  }
  return current.filter((value): value is JsonObject => isSubdocument(value));
}

function columnsBelow(
  documents: readonly Document[],
  expanded: ReadonlySet<string>,
  prefix: readonly string[],
  arrayDepth?: number,
): ColumnNode[] {
  const objects = objectsAt(documents, prefix);
  const names = [...new Set(objects.flatMap((object) => Object.keys(object)))];
  if (prefix.length === 0 && names.includes('_id')) {
    names.splice(names.indexOf('_id'), 1);
    names.unshift('_id');
  }
  return names.map((name) => {
    const path = [...prefix, name];
    const key = path.join('.');
    // Inside the elements of an expanded array, an array is a plain value: one level of sub-rows only.
    const array = arrayDepth === undefined && objects.some((object) => hasSubdocumentElements(object[name]));
    const expandable = array || objects.some((object) => hasFields(object[name]));
    const base = { path, key, expandable, array, ...(arrayDepth === undefined ? {} : { arrayDepth }) };
    if (expandable && expanded.has(key)) {
      return { ...base, children: columnsBelow(documents, expanded, path, array ? path.length : arrayDepth) };
    }
    return base;
  });
}

/**
 * Feature: table.detect-columns
 *
 * The tree of columns of a page: one per field of its documents, `_id` first and the others in the order first met;
 * the expanded paths that can be expanded in this page have their children.
 */
export function columnsOfDocuments(documents: readonly Document[], expanded: Iterable<string>): readonly ColumnNode[] {
  return columnsBelow(documents, new Set(expanded), []);
}

/** The columns that are drawn, from left to right, with the groups each opens and closes. */
export function leaves(nodes: readonly ColumnNode[]): readonly Leaf[] {
  return nodes.flatMap((node): Leaf[] => {
    if (node.children === undefined || node.children.length === 0) {
      return [{ node, starts: [], ends: [] }];
    }
    const inner = leaves(node.children);
    return inner.map((leaf, index) => ({
      node: leaf.node,
      starts: index === 0 ? [node.key, ...leaf.starts] : leaf.starts,
      ends: index === inner.length - 1 ? [node.key, ...leaf.ends] : leaf.ends,
    }));
  });
}

/** How many columns are drawn under a column. */
export function leafCount(node: ColumnNode): number {
  return node.children === undefined ? 1 : node.children.reduce((sum, child) => sum + leafCount(child), 0);
}

/** A column of the tree by its key. */
export function columnByKey(nodes: readonly ColumnNode[], key: string): ColumnNode | undefined {
  for (const node of nodes) {
    if (node.key === key) {
      return node;
    }
    const found = node.children === undefined ? undefined : columnByKey(node.children, key);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** The key of a column and every expandable path below it in the page, for **Expand all levels**. */
export function expandableBelow(documents: readonly Document[], node: ColumnNode): readonly string[] {
  const keys = [node.key];
  const walk = (prefix: readonly string[], depth: number | undefined): void => {
    for (const child of columnsBelow(documents, new Set(), prefix, depth)) {
      if (child.expandable) {
        keys.push(child.key);
        walk(child.path, child.array ? child.path.length : depth);
      }
    }
  };
  walk(node.path, node.array ? node.path.length : node.arrayDepth);
  return keys;
}
