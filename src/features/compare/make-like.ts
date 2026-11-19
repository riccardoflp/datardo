/**
 * Feature: compare.make-like
 *
 * Makes one side like the other for every difference of the comparison, not only those the list shows: the documents
 * missing on that side are inserted and the different ones replaced, whole as they are on the other side, 500 a
 * `bulkWrite`; then, when the user chose so, the documents found only on that side are deleted, 500 a `deleteMany`.
 * The source documents are read by `_id` before the confirmation (Q36). Nothing is published for redis-oplog.
 *
 * Started with `{ left, right, to, differences, comparing }`: the two sides, the side made like the other (`to`),
 * every difference of the page's last comparison (`compare.read`, in its order; none after **⇄**), and whether a
 * comparison runs.
 */
import type { Json } from '../../shared/engine-request';
import {
  ask,
  needRead,
  refuse,
  run,
  type Answers,
  type Context,
  type Danger,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { Question } from '../../shared/question';
import { groupThousands } from '../../shared/text-units';
import { undoNoteOf, undoOf } from '../document/write/undo-note';
import { documentsArgs } from './read-details';
import { documentsText, text } from './text';
import { idKey, onlyOn, otherSide, readDifferences, sideText, type Difference, type Side } from './types';
import {
  copySteps,
  deleteSteps,
  documentsInOrder,
  keptOf,
  refreshAfter,
  refusedTarget,
  targetPlace,
  writeSides,
  writeStart,
  type WriteStart,
} from './writes/steps';

/** The `_id`s each part of the write takes: missing on the side written, different, only on the side written. */
export interface MakeLikeIds {
  readonly inserts: readonly Json[];
  readonly replaces: readonly Json[];
  readonly deletes: readonly Json[];
}

/** The `_id`s of the differences, by what writing `to` does with them, in the order of the comparison. */
export function makeLikeIds(differences: readonly Difference[], to: Side): MakeLikeIds {
  const of = (kind: Difference['kind']) => differences.filter((each) => each.kind === kind).map((each) => each.id);
  return { inserts: of(onlyOn(otherSide(to))), replaces: of('different'), deletes: of(onlyOn(to)) };
}

/** The question whether the documents only on the side written are deleted too. */
function deletesQuestion(to: Side, count: number): Question {
  return {
    title: to === 'right' ? text.bulk.rightLikeLeft : text.bulk.leftLikeRight,
    button: text.writes.next,
    fields: [
      {
        kind: 'pick-one',
        key: 'deletes',
        label: text.writes.canAlsoDelete(count, to),
        choices: [
          { value: 'keep', label: text.writes.keepThem },
          { value: 'delete', label: text.writes.deleteThem },
        ],
        default: 'keep',
      },
    ],
  };
}

/** `insert 3, replace 2`: the parts of the copy that are not zero. */
function copyParts(inserts: number, replaces: number): string {
  const parts = [
    inserts > 0 ? `insert ${groupThousands(inserts)}` : '',
    replaces > 0 ? `replace ${groupThousands(replaces)}` : '',
  ];
  return parts.filter((part) => part !== '').join(', ');
}

interface Written {
  readonly inserted: readonly Json[];
  readonly replaced: readonly Json[];
  readonly deleted: readonly Json[];
}

function dangerOf(start: WriteStart, where: string, written: Written): Danger {
  const copies = written.inserted.length + written.replaced.length;
  const lines = [
    text.writes.manyQuestion(start.to, where),
    copies > 0
      ? text.writes.copies(copyParts(written.inserted.length, written.replaced.length), copies, otherSide(start.to))
      : '',
    written.deleted.length > 0 ? text.writes.deletes(written.deleted.length, start.to) : '',
  ];
  const textOf = lines.filter((line) => line !== '').join('\n');
  return { kind: 'confirm', text: textOf, button: copies > 0 ? text.writes.apply : text.writes.delete };
}

/** What is written, once the source documents are read: those no longer there are left out. */
function writtenOf(
  ids: MakeLikeIds,
  source: unknown,
  deleting: boolean,
): { readonly written: Written; readonly documents: readonly Json[] } {
  const documents = documentsInOrder(source, [...ids.inserts, ...ids.replaces]);
  const found = new Set(documents.map((document) => idKey((document as { readonly _id?: Json })._id ?? null)));
  const kept = (list: readonly Json[]) => list.filter((id) => found.has(idKey(id)));
  return {
    written: { inserted: kept(ids.inserts), replaced: kept(ids.replaces), deleted: deleting ? ids.deletes : [] },
    documents,
  };
}

/** Feature: compare.make-like — the guard, the question on the deletes, the read of the sources, then the plan. */
export function plan(context: Context, answers: Answers): Outcome {
  const start = writeStart(context, answers);
  const { target, source } = writeSides(context, start);
  const refused = refusedTarget(target, 'compare.make-like/read-only', 'compare.make-like/view');
  if (refused !== undefined) {
    return refused;
  }
  if (start.comparing) {
    return refuse('compare.make-like/comparing', text.refusals.comparing);
  }
  const ids = makeLikeIds(readDifferences(start.args['differences']), start.to);
  const copies = ids.inserts.length + ids.replaces.length;
  if (copies + ids.deletes.length === 0) {
    return refuse('compare.make-like/stale', text.refusals.stale);
  }
  if (copies > 0 && ids.deletes.length > 0 && answers['deletes'] === undefined) {
    return ask(deletesQuestion(start.to, ids.deletes.length));
  }
  if (copies > 0 && !('source' in answers)) {
    const read = documentsArgs(start.left, start.right, otherSide(start.to), [...ids.inserts, ...ids.replaces]);
    return needRead('source', 'compare.read-details', read);
  }
  const deleting = copies === 0 || answers['deletes'] === 'delete';
  const { written, documents } = writtenOf(ids, answers['source'], deleting);
  const touched = [...written.inserted, ...written.replaced, ...written.deleted];
  if (touched.length === 0) {
    return refuse('compare.make-like/stale', text.refusals.stale);
  }
  const kept = keptOf(target, touched);
  return run({
    title: text.writes.title(sideText(source)),
    steps: [...copySteps(target, documents), ...deleteSteps(target, written.deleted)],
    danger: dangerOf(start, sideText(target), written),
    touches: documentsText(touched.length),
    undo: undoOf(undoNoteOf(targetPlace(context, target), context.state.settings, kept), kept),
    publishes: false,
    after: [refreshAfter(target)],
  });
}

export { afterReplies } from './writes/steps';

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('compare.make-like'), plan };
