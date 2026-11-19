/**
 * What the comparison page shows of a result (`compare.show`): the four chips and the summary, the two buttons that
 * make one side like the other, and the rows of the list with their buttons.
 */
import type { Json } from '../../../shared/engine-request';
import { formattedValue } from '../../query/format';
import type { DetailEntry } from '../read-details';
import { text } from '../text';
import type { CompareCounts, DifferenceKind, Side, SideInfo } from '../types';

/** A result as the page keeps it: what `compare.read` counted and `compare.read-details` read, and how long it took. */
export interface ShownResult {
  readonly counts: CompareCounts;
  readonly entries: readonly DetailEntry[];
  readonly milliseconds: number;
  readonly filtered: boolean;
}

/** A chip of the counts. *identical* only counts; the others keep the rows of their kind when pressed. */
export interface ChipView {
  readonly kind: 'identical' | DifferenceKind;
  readonly label: string;
  readonly pressed: boolean;
  readonly enabled: boolean;
}

/** A button that writes a side, enabled or disabled with the reason as its tooltip. */
export interface WriteButton {
  readonly label: string;
  readonly hint: string;
  readonly to: Side;
  readonly enabled: boolean;
}

/** A row of the list. */
export interface RowView {
  readonly kind: DifferenceKind;
  readonly kindLabel: string;
  readonly id: Json;
  readonly idText: string;
  /** The paths that differ, or the document on one line. */
  readonly what: string;
  readonly buttons: readonly (WriteButton & { readonly element: 'compare.copy-document@table' })[];
}

/** `1.4 s`. */
export function secondsText(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

/** The number of differences. */
export function differencesOf(counts: CompareCounts): number {
  return counts.different + counts.onlyLeft + counts.onlyRight;
}

/** The text after the chips: *24 differences · 1.4 s*, or that the collections are the same. */
export function summaryText(result: ShownResult): string {
  const seconds = secondsText(result.milliseconds);
  const count = differencesOf(result.counts);
  if (count > 0) {
    return text.counts.differences(count, seconds);
  }
  return result.filtered ? text.counts.sameForFilter(seconds) : text.counts.same(seconds);
}

const countOfKind = (counts: CompareCounts, kind: DifferenceKind): number =>
  kind === 'different' ? counts.different : kind === 'only-left' ? counts.onlyLeft : counts.onlyRight;

/** The four chips. */
export function chips(counts: CompareCounts, pressed: DifferenceKind | undefined): readonly ChipView[] {
  const kinds: readonly DifferenceKind[] = ['different', 'only-left', 'only-right'];
  const labels = {
    different: text.counts.different,
    'only-left': text.counts.onlyLeft,
    'only-right': text.counts.onlyRight,
  };
  return [
    { kind: 'identical', label: text.counts.identical(counts.identical), pressed: false, enabled: false },
    ...kinds.map((kind) => ({
      kind,
      label: labels[kind](countOfKind(counts, kind)),
      pressed: pressed === kind,
      enabled: countOfKind(counts, kind) > 0,
    })),
  ];
}

/** Why a side's documents can't be changed, as the tooltip of a disabled button says it. */
export function whyText(side: SideInfo): string | undefined {
  if (side.readOnlyWhy === 'read-only') {
    return text.why.readOnly(side.connectionName);
  }
  return side.readOnlyWhy === 'view' ? text.why.view(side.collection) : undefined;
}

function button(label: string, hint: string, to: Side, blocked: string | undefined): WriteButton {
  return { label, hint: blocked ?? hint, to, enabled: blocked === undefined };
}

/** Why the writes to a side are disabled now: a comparison runs, or the side can't be changed. */
function blockedOf(side: SideInfo, running: boolean): string | undefined {
  return running ? text.refusals.comparing : whyText(side);
}

/** **Make right like left…** and **Make left like right…**, when the comparison found a difference. */
export function bulkButtons(
  counts: CompareCounts,
  sides: { readonly left: SideInfo; readonly right: SideInfo },
  running: boolean,
): readonly WriteButton[] {
  if (differencesOf(counts) === 0) {
    return [];
  }
  return [
    button(text.bulk.rightLikeLeft, text.bulk.rightLikeLeftHint, 'right', blockedOf(sides.right, running)),
    button(text.bulk.leftLikeRight, text.bulk.leftLikeRightHint, 'left', blockedOf(sides.left, running)),
  ];
}

/** *Showing the first 300 of 1,204; …* for the first kind that has more than the list shows. */
export function shownLine(result: ShownResult): string | undefined {
  const kinds: readonly DifferenceKind[] = ['different', 'only-left', 'only-right'];
  for (const kind of kinds) {
    const shown = result.entries.filter((entry) => entry.kind === kind).length;
    const total = countOfKind(result.counts, kind);
    if (total > shown) {
      return text.bulk.shown(shown, total);
    }
  }
  return undefined;
}

function rowButtons(
  kind: DifferenceKind,
  sides: { readonly left: SideInfo; readonly right: SideInfo },
  running: boolean,
): RowView['buttons'] {
  const [toRight, toLeft] = [blockedOf(sides.right, running), blockedOf(sides.left, running)];
  const element = 'compare.copy-document@table' as const;
  const pairs: readonly WriteButton[] =
    kind === 'different'
      ? [
          button(text.rows.toRight, text.rows.replaceRight, 'right', toRight),
          button(text.rows.toLeft, text.rows.replaceLeft, 'left', toLeft),
        ]
      : kind === 'only-left'
        ? [
            button(text.rows.toRight, text.rows.insertRight, 'right', toRight),
            button(text.rows.delete, text.rows.deleteLeft, 'left', toLeft),
          ]
        : [
            button(text.rows.delete, text.rows.deleteRight, 'right', toRight),
            button(text.rows.toLeft, text.rows.insertLeft, 'left', toLeft),
          ];
  return pairs.map((each) => ({ ...each, element }));
}

/** The rows of the list, of the kind of the chip pressed or of every kind. */
export function rows(
  result: ShownResult,
  sides: { readonly left: SideInfo; readonly right: SideInfo },
  pressed: DifferenceKind | undefined,
  running: boolean,
): readonly RowView[] {
  return result.entries
    .filter((entry) => pressed === undefined || entry.kind === pressed)
    .map((entry) => ({
      kind: entry.kind,
      kindLabel: text.kinds[entry.kind],
      id: entry.id,
      idText: formattedValue(entry.id, 'one-line'),
      what: entry.kind === 'different' ? entry.summary : entry.preview,
      buttons: rowButtons(entry.kind, sides, running),
    }));
}

/** The text of the list when it has no row: *No differences.* or *Nothing of this kind.* */
export function emptyText(result: ShownResult, pressed: DifferenceKind | undefined): string | undefined {
  if (differencesOf(result.counts) === 0) {
    return text.states.noDifferences;
  }
  return pressed !== undefined && !result.entries.some((entry) => entry.kind === pressed)
    ? text.states.nothingOfKind
    : undefined;
}
