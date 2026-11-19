/**
 * The list and the inspector island of the structure comparison page (`structure.show`): the differences grouped by
 * collection, filtered by **Only differences** and the chip pressed, with their **Apply…** buttons; and the detail of
 * the selected difference.
 */
import { formattedValue } from '../../query/format';
import { differenceScript } from '../script';
import { text } from '../text';
import type { DifferenceKind, StructureDifference } from '../types';
import { objectText } from './order';

/** An **Apply…** button: what it applies, whether it can be pressed, and why not. */
export interface ApplyControl {
  readonly label: string;
  readonly hint: string;
  readonly enabled: boolean;
  /** The differences it applies. */
  readonly chosen: readonly string[];
  readonly element: 'structure.apply@table' | 'structure.apply@inspector';
}

/** One row of the list. */
export interface DifferenceRow {
  readonly id: string;
  readonly kind: string;
  readonly object: string;
  readonly summary: string;
  readonly selected: boolean;
  readonly apply?: ApplyControl;
}

/** The rows of one collection. */
export interface CollectionGroup {
  readonly collection: string;
  /** *view* or *time series*, when it is one. */
  readonly badge?: string;
  /** *· 3 differences* or *· same*. */
  readonly count: string;
  readonly folded: boolean;
  readonly apply?: ApplyControl;
  readonly rows: readonly DifferenceRow[];
}

/** What the list is drawn with. */
export interface ListInput {
  readonly differences: readonly StructureDifference[];
  readonly showAll: boolean;
  readonly chip?: DifferenceKind;
  readonly folded: readonly string[];
  readonly selected?: string;
  /** Why **Apply…** cannot be pressed now: a read-only right connection, a comparison that runs. */
  readonly applyBlocked?: string;
}

/** Whether a command can apply a difference: it differs, and one of its steps has a command. */
export function isApplicable(difference: StructureDifference): boolean {
  return difference.kind !== 'same' && difference.steps.some((step) => step.operation !== undefined);
}

function dropsSomething(difference: StructureDifference): boolean {
  return difference.steps.some((step) => step.operation !== undefined && step.destructive);
}

function applyControl(
  chosen: readonly StructureDifference[],
  hint: string,
  blocked: string | undefined,
  element: ApplyControl['element'],
): ApplyControl {
  return {
    label: text.show.apply,
    hint: blocked ?? hint,
    enabled: blocked === undefined,
    chosen: chosen.map((difference) => difference.id),
    element,
  };
}

/** The **Apply…** of one difference, when a command can apply it. */
export function differenceApply(
  difference: StructureDifference,
  blocked: string | undefined,
  element: ApplyControl['element'],
): ApplyControl | undefined {
  if (!isApplicable(difference)) {
    return undefined;
  }
  const hint = dropsSomething(difference) ? text.show.applyDropHint : text.show.applyHint;
  return applyControl([difference], hint, blocked, element);
}

function isShown(difference: StructureDifference, input: ListInput): boolean {
  if (input.chip !== undefined) {
    return difference.kind === input.chip;
  }
  return input.showAll || difference.kind !== 'same';
}

function badgeOf(difference: StructureDifference): { readonly badge?: string } {
  switch (difference.collectionType) {
    case 'view':
      return { badge: text.objects.view };
    case 'timeseries':
      return { badge: text.objects.timeseries };
    case 'collection':
      return {};
  }
}

function groupOf(collection: string, all: readonly StructureDifference[], input: ListInput): CollectionGroup {
  const shown = all.filter((difference) => isShown(difference, input));
  const differing = all.filter((difference) => difference.kind !== 'same');
  const applicable = all.filter(isApplicable);
  const first = all[0];
  return {
    collection,
    ...(first === undefined ? {} : badgeOf(first)),
    count: differing.length === 0 ? text.show.groupSame : text.show.groupCount(differing.length),
    folded: input.folded.includes(collection),
    ...(applicable.length > 1
      ? {
          apply: applyControl(
            applicable,
            text.show.applyGroupHint(applicable.length, collection),
            input.applyBlocked,
            'structure.apply@table',
          ),
        }
      : {}),
    rows: shown.map((difference) => {
      const apply = differenceApply(difference, input.applyBlocked, 'structure.apply@table');
      return {
        id: difference.id,
        kind: text.show.kinds[difference.kind],
        object: objectText(difference),
        summary: difference.summary,
        selected: difference.id === input.selected,
        ...(apply === undefined ? {} : { apply }),
      };
    }),
  };
}

/** The groups of the list, by collection in order of name; a group with no row shown is left out. */
export function groupsOf(input: ListInput): readonly CollectionGroup[] {
  const names = [...new Set(input.differences.map((difference) => difference.collection))].sort((a, b) =>
    a.localeCompare(b),
  );
  return names
    .map((name) =>
      groupOf(
        name,
        input.differences.filter((difference) => difference.collection === name),
        input,
      ),
    )
    .filter((group) => group.rows.length > 0);
}

/** One row of the table **field**, **left**, **right**. */
export interface FieldRow {
  readonly field: string;
  readonly left: string;
  readonly right: string;
  /** *Missing on this side*, on the side that lacks the field. */
  readonly leftHint?: string;
  readonly rightHint?: string;
}

/** What the inspector island shows of the selected difference. */
export interface DifferenceDetail {
  readonly copyScript?: {
    readonly label: string;
    readonly hint: string;
    readonly element: 'structure.copy-script@inspector';
  };
  readonly apply?: ApplyControl;
  /** *The same on both sides*, or *No command can do this: the script says what to do*. */
  readonly message?: string;
  readonly fields: readonly FieldRow[];
  readonly left?: string;
  readonly right?: string;
  readonly stepsTitle: string;
  readonly steps: string;
}

function messageOf(difference: StructureDifference): { readonly message?: string } {
  if (difference.kind === 'same') {
    return { message: text.show.sameOnBoth };
  }
  return difference.steps.length > 0 && !isApplicable(difference) ? { message: text.show.noCommand } : {};
}

function fieldRows(difference: StructureDifference): readonly FieldRow[] {
  return (difference.fields ?? []).map((field) => ({
    field: field.path,
    left: field.left === undefined ? text.show.missing : formattedValue(field.left, 'one-line'),
    right: field.right === undefined ? text.show.missing : formattedValue(field.right, 'one-line'),
    ...(field.left === undefined ? { leftHint: text.show.missingHint } : {}),
    ...(field.right === undefined ? { rightHint: text.show.missingHint } : {}),
  }));
}

/** The detail of a difference in the inspector island, with the steps as **Include drops in the script** has them. */
export function detailOf(
  difference: StructureDifference,
  where: { readonly database: string; readonly drops: boolean; readonly applyBlocked?: string },
): DifferenceDetail {
  const apply = differenceApply(difference, where.applyBlocked, 'structure.apply@inspector');
  const hasSteps = difference.steps.length > 0;
  return {
    ...(hasSteps
      ? {
          copyScript: {
            label: text.show.copyScript,
            hint: text.show.copyStepsHint,
            element: 'structure.copy-script@inspector',
          },
        }
      : {}),
    ...(apply === undefined ? {} : { apply }),
    ...messageOf(difference),
    fields: fieldRows(difference),
    ...(difference.left === undefined ? {} : { left: formattedValue(difference.left, 'pretty') }),
    ...(difference.right === undefined ? {} : { right: formattedValue(difference.right, 'pretty') }),
    stepsTitle: text.show.stepsOnRight,
    steps: hasSteps ? differenceScript(difference, where.database, where.drops) : '',
  };
}
