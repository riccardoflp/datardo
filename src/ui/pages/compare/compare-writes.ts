/**
 * What the comparison page starts on its rows and its toolbar: the document of a selected row (`compare.read-details`
 * with `selected`), **→ Right**, **← Left** and **Delete** of a row (`compare.copy-document`), **Make right like
 * left…** and **Make left like right…** (`compare.make-like`), and **Open left** and **Open right** (`tab.open` of a
 * document tab). After a write the page compares again.
 */
import type { SelectedDocument } from '../../../features/compare/read-details';
import { idKey, sideJson, sideTarget, type Side } from '../../../features/compare/types';
import type { Json } from '../../../shared/engine-request';
import { featureId } from '../../../shared/ids';
import { startFeature } from '../../shell/intent';
import { documentShows } from '../document/document-actions';
import { compare } from './compare-runs';
import { changePage, compareTabOf } from './compare-store';

function sidesOf(tab: string) {
  const page = compareTabOf(tab)?.page;
  const right = page?.right;
  return page === undefined || right === undefined ? undefined : { page, left: page.left, right };
}

/** Selects a row: its difference in the inspector island, with the document read for a row on one side only. */
export async function selectRow(tab: string, id: Json): Promise<void> {
  const sides = sidesOf(tab);
  const entry = sides?.page.result?.entries.find((each) => idKey(each.id) === idKey(id));
  if (sides === undefined || entry === undefined || idKey(sides.page.selected?.id ?? null) === idKey(id)) {
    return;
  }
  changePage(tab, (page) => ({ ...page, selected: { id } }));
  if (entry.kind === 'different') {
    return;
  }
  const side: Side = entry.kind === 'only-left' ? 'left' : 'right';
  const result = await window.datardo.start({
    feature: featureId('compare.read-details'),
    target: sideTarget(sides[side]),
    place: 'table',
    args: { mode: 'selected', left: sideJson(sides.left), right: sideJson(sides.right), side, id },
  });
  const read: SelectedDocument | { readonly kind: 'error'; readonly message: string } =
    result.kind === 'read'
      ? (result.result as SelectedDocument)
      : { kind: 'error', message: result.kind === 'failed' || result.kind === 'refused' ? result.message : '' };
  changePage(tab, (page) =>
    idKey(page.selected?.id ?? null) === idKey(id) ? { ...page, selected: { id, read } } : page,
  );
}

/** **→ Right**, **← Left**, **Delete** of a row: one document made like the other side, after its confirmation. */
export async function copyDocument(tab: string, id: Json, to: Side): Promise<void> {
  const sides = sidesOf(tab);
  const entry = sides?.page.result?.entries.find((each) => idKey(each.id) === idKey(id));
  if (sides === undefined || entry === undefined) {
    return;
  }
  const result = await window.datardo.start({
    feature: featureId('compare.copy-document'),
    target: sideTarget(sides[to]),
    place: 'table',
    args: {
      left: sideJson(sides.left),
      right: sideJson(sides.right),
      to,
      difference: { id, kind: entry.kind },
      comparing: sides.page.progress !== undefined,
    },
  });
  if (result.kind === 'done') {
    await compare(tab);
  }
}

/** **Make right like left…**, **Make left like right…**: every difference, after its question and confirmation. */
export async function makeLike(tab: string, to: Side): Promise<void> {
  const sides = sidesOf(tab);
  const differences = compareTabOf(tab)?.differences ?? [];
  if (sides === undefined) {
    return;
  }
  const result = await window.datardo.start({
    feature: featureId('compare.make-like'),
    target: sideTarget(sides[to]),
    place: 'toolbar',
    args: {
      left: sideJson(sides.left),
      right: sideJson(sides.right),
      to,
      differences: differences.map((each) => ({ id: each.id, kind: each.kind })),
      comparing: sides.page.progress !== undefined,
    },
  });
  if (result.kind === 'done') {
    await compare(tab);
  }
}

/** **Open left**, **Open right**: the document in a document tab, read-only when that side is. */
export function openSide(tab: string, side: Side): void {
  const sides = sidesOf(tab);
  const id = sides?.page.selected?.id;
  if (sides === undefined || id === undefined) {
    return;
  }
  const where = sides[side];
  startFeature('tab.open', { place: 'inspector', args: { shows: documentShows(where, id, where.view) } });
}
