/**
 * Feature: table.arrange-columns
 *
 * Changes the layout of the columns of a collection and remembers it: hide, show, move, pin, resize, reset.
 */
import type { Json } from '../../shared/engine-request';
import { refuse, run, type Answers, type Context, type Outcome } from '../../shared/feature';
import { isJsonObject } from '../query/mongosh/ejson';
import { narrowestColumn, movedLayout } from './layout';
import { text } from './text';
import {
  collectionLabel,
  collectionOf,
  naturalLayout,
  saveColumnsStep,
  startArgs,
  tablePlan,
  type ColumnLayout,
  type ColumnNode,
} from './types';

/** A change of the layout. */
export type LayoutChange =
  | { readonly kind: 'hide'; readonly key: string }
  | { readonly kind: 'show'; readonly key: string }
  | { readonly kind: 'show-all' }
  | { readonly kind: 'pin'; readonly key: string }
  | { readonly kind: 'unpin'; readonly key: string }
  | { readonly kind: 'move'; readonly source: string; readonly target: string; readonly after: boolean }
  | { readonly kind: 'move-left'; readonly key: string }
  | { readonly kind: 'move-right'; readonly key: string }
  | { readonly kind: 'resize'; readonly key: string; readonly width: number }
  | { readonly kind: 'reset-width'; readonly key: string }
  | { readonly kind: 'reset' };

/** The new layout, `'level'` for a move between columns of different levels, or `undefined` when nothing changes. */
export type Arrangement = ColumnLayout | 'level' | undefined;

/** The top-level column a column belongs to: `address` for `address.city`. */
export function topOf(key: string): string {
  return key.split('.')[0] ?? key;
}

function without(list: readonly string[] | undefined, key: string): readonly string[] {
  return (list ?? []).filter((each) => each !== key);
}

function siblingKeys(columns: readonly ColumnNode[], key: string): readonly string[] | undefined {
  if (columns.some((node) => node.key === key)) {
    return columns.map((node) => node.key);
  }
  for (const node of columns) {
    const found = node.children === undefined ? undefined : siblingKeys(node.children, key);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function stepped(columns: readonly ColumnNode[], layout: ColumnLayout, key: string, step: -1 | 1): Arrangement {
  const siblings = siblingKeys(columns, key) ?? [];
  const target = siblings[siblings.indexOf(key) + step];
  return target === undefined ? undefined : movedLayout(columns, layout, { source: key, target, after: step === 1 });
}

function withWidth(layout: ColumnLayout, key: string, width: number | undefined): ColumnLayout {
  const widths = Object.fromEntries(Object.entries(layout.widths ?? {}).filter(([each]) => each !== key));
  return {
    ...layout,
    widths: width === undefined ? widths : { ...widths, [key]: Math.max(narrowestColumn, Math.round(width)) },
  };
}

/**
 * The layout after a change, `columns` being the columns drawn in their order: a child column pins its top-level
 * column; a move between columns of different levels is `'level'`; a move past the end changes nothing.
 */
export function arrangedLayout(
  layout: ColumnLayout,
  change: LayoutChange,
  columns: readonly ColumnNode[],
): Arrangement {
  switch (change.kind) {
    case 'hide':
      return { ...layout, hidden: [...without(layout.hidden, change.key), change.key] };
    case 'show':
      return { ...layout, hidden: without(layout.hidden, change.key) };
    case 'show-all':
      return { ...layout, hidden: [] };
    case 'pin':
      return { ...layout, pinned: [...without(layout.pinned, topOf(change.key)), topOf(change.key)] };
    case 'unpin':
      return { ...layout, pinned: without(layout.pinned, topOf(change.key)) };
    case 'move':
      return movedLayout(columns, layout, change) ?? 'level';
    case 'move-left':
      return stepped(columns, layout, change.key, -1);
    case 'move-right':
      return stepped(columns, layout, change.key, 1);
    case 'resize':
      return withWidth(layout, change.key, change.width);
    case 'reset-width':
      return withWidth(layout, change.key, undefined);
    case 'reset':
      return naturalLayout;
  }
}

function changeOf(value: Json | undefined): LayoutChange {
  return (isJsonObject(value) ? value : { kind: 'reset' }) as unknown as LayoutChange;
}

/**
 * Feature: table.arrange-columns
 *
 * One app step that remembers the layout after `args.change`, from `args.layout` and the columns drawn,
 * `args.columns`; refused for a move between columns of different levels.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const where = collectionOf(context, args);
  const change = changeOf(args['change']);
  const layout = (isJsonObject(args['layout']) ? args['layout'] : naturalLayout) as ColumnLayout;
  const columns = (Array.isArray(args['columns']) ? args['columns'] : []) as unknown as readonly ColumnNode[];
  const arranged = arrangedLayout(layout, change, columns);
  if (arranged === 'level') {
    return refuse('table.arrange-columns/level', text.plans.level(change.kind === 'move' ? change.source : ''));
  }
  if (arranged === undefined) {
    return run(tablePlan(text.plans.arrange, []));
  }
  return run(
    tablePlan(text.plans.arrange, [
      saveColumnsStep(text.plans.saveLayoutStep(collectionLabel(context, where)), where, { layout: arranged }),
    ]),
  );
}
