/**
 * The order in which the steps of differences run (`structure.script`, rule 2): collections to create; collections to
 * create again; options and indexes; shard keys; views, each after the view it is on; search indexes; last, what is
 * only on the right. Within a group, by collection name. And the name of a difference in the script, the
 * confirmation and the notification: `orders index status_1`. Ported from Mongoster's `src/shared/structure.ts ›
 * orderForScript`, `diffTitle`.
 */
import { text } from '../text';
import type { StructureDifference } from '../types';

function phase(difference: StructureDifference): number {
  if (difference.kind === 'only-right' && difference.object !== 'shard-key') {
    return 6;
  }
  switch (difference.object) {
    case 'collection':
      return difference.kind === 'only-left' ? 0 : 1;
    case 'options':
    case 'index':
      return 2;
    case 'shard-key':
      return 3;
    case 'view':
      return 4;
    case 'search-index':
      return 5;
  }
}

/** The views placed each after the one it is on, when that one is created or changed too. */
function viewsInOrder(views: readonly StructureDifference[]): readonly StructureDifference[] {
  const placed: StructureDifference[] = [];
  const visit = (view: StructureDifference, seen: Set<StructureDifference>): void => {
    if (placed.includes(view) || seen.has(view)) {
      return;
    }
    seen.add(view);
    for (const other of views) {
      if (other !== view && other.collection === view.viewOn) {
        visit(other, seen);
      }
    }
    placed.push(view);
  };
  for (const view of views) {
    visit(view, new Set());
  }
  return placed;
}

/** The differences that have steps, in the order their steps can run. */
export function orderForScript(differences: readonly StructureDifference[]): readonly StructureDifference[] {
  const sorted = differences
    .filter((difference) => difference.steps.length > 0)
    .sort((a, b) => phase(a) - phase(b) || a.collection.localeCompare(b.collection));
  const views = sorted.filter((difference) => phase(difference) === 4);
  return [
    ...sorted.filter((difference) => phase(difference) < 4),
    ...viewsInOrder(views),
    ...sorted.filter((difference) => phase(difference) > 4),
  ];
}

/** What a difference is about: `collection`, `view`, `time series`, `options`, `index status_1`, `shard key`. */
export function objectText(difference: StructureDifference): string {
  if (difference.object === 'collection') {
    return difference.collectionType === 'timeseries' ? text.objects.timeseries : text.objects.collection;
  }
  const object = text.objects[difference.object];
  return difference.name === undefined ? object : `${object} ${difference.name}`;
}

/** The name of a difference: `orders index status_1`, `users options`. */
export function differenceName(difference: StructureDifference): string {
  return `${difference.collection} ${objectText(difference)}`;
}
