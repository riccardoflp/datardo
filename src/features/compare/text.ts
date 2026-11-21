/**
 * The text of the compare area, word for word from its cards (R10.1).
 */
import { groupThousands } from '../../shared/text-units';
import type { Side } from './types';

/** `1 document`, `3 documents`. */
export function documentsText(count: number): string {
  return `${groupThousands(count)} ${count === 1 ? 'document' : 'documents'}`;
}

const sideWords: Readonly<Record<Side, string>> = { left: 'left', right: 'right' };

/** The text of the compare area. */
export const text = {
  commands: { show: 'Compare with…' },
  title: (left: string, right?: string) =>
    right === undefined || right === left ? `Compare: ${left}` : `Compare: ${left} ↔ ${right}`,
  openPlan: 'Open the comparison of two collections',
  openStep: (namespace: string) => `open the comparison of ${namespace}`,
  keepPlan: 'Keep the sides and options of the comparison',
  keepStep: (title: string) => `keep the sides and options of ${title} with its tab`,
  sides: {
    left: 'Left',
    right: 'Right',
    connection: 'Connection',
    database: 'Database',
    collection: 'Collection',
    readOnly: 'read-only',
    sameConnection: 'same connection',
    view: 'view',
    swap: '⇄',
    swapHint: 'Swap the sides',
    swapping: 'Swapping the sides…',
    nothingToCompare: (connection: string, database: string) =>
      `${connection} › ${database} has no other collection to compare with.`,
    couldNotConnect: (connection: string, message: string) => `Could not connect to ${connection}: ${message}`,
  },
  why: {
    readOnly: (connection: string) => `The connection ${connection} is read-only.`,
    view: (collection: string) => `${collection} is a view.`,
  },
  options: {
    filter: 'Filter',
    filterPlaceholder: '{ status: "active" }  —  documents compared on both sides',
    ignore: 'Ignore',
    ignorePlaceholder: 'updatedAt, __v',
    ignoreHint: 'Fields left out of the comparison, separated by commas (address.zip, items.price…)',
    ignoreOrder: 'Ignore field order',
    ignoreOrderHint: 'Documents whose fields are the same in a different order are equal',
    numbersByValue: 'Compare numbers by value',
    numbersByValueHint: '1 (int), 1.0 (double) and NumberLong(1) are equal',
    compare: 'Compare',
    compareHint: 'Compare (Enter in the fields)',
    cancel: 'Cancel',
  },
  counts: {
    identical: (count: number) => `${groupThousands(count)} identical`,
    different: (count: number) => `${groupThousands(count)} different`,
    onlyLeft: (count: number) => `${groupThousands(count)} only left`,
    onlyRight: (count: number) => `${groupThousands(count)} only right`,
    differences: (count: number, seconds: string) =>
      `${groupThousands(count)} ${count === 1 ? 'difference' : 'differences'} · ${seconds}`,
    same: (seconds: string) => `The collections are the same · ${seconds}`,
    sameForFilter: (seconds: string) => `The collections are the same for the filter · ${seconds}`,
  },
  bulk: {
    rightLikeLeft: 'Make right like left…',
    rightLikeLeftHint:
      'Insert the documents missing on the right, replace the different ones (and optionally delete those only on the right)',
    leftLikeRight: 'Make left like right…',
    leftLikeRightHint:
      'Insert the documents missing on the left, replace the different ones (and optionally delete those only on the left)',
    shown: (shown: number, total: number) =>
      `Showing the first ${groupThousands(shown)} of ${groupThousands(total)}; the buttons above apply to all of them.`,
  },
  kinds: { different: 'Different', 'only-left': 'Only left', 'only-right': 'Only right' },
  list: { kind: 'Kind', id: '_id', what: 'What differs', write: 'Make alike' },
  rows: {
    toRight: '→ Right',
    toLeft: '← Left',
    delete: 'Delete',
    replaceRight: 'Replace the right document with the left one',
    replaceLeft: 'Replace the left document with the right one',
    insertRight: 'Insert the document into the right collection',
    insertLeft: 'Insert the document into the left collection',
    deleteLeft: 'Delete the document from the left collection',
    deleteRight: 'Delete the document from the right collection',
  },
  inspector: {
    field: 'field',
    left: 'left',
    right: 'right',
    missing: '—',
    missingHint: 'The field is missing',
    fieldOrder: 'Same fields and values in a different order',
    openLeft: 'Open left',
    openRight: 'Open right',
    copy: 'Copy',
    missingOn: (side: Side) => `Missing on the ${sideWords[side]} side`,
    gone: 'The document no longer exists.',
  },
  states: {
    noDifferences: 'No differences.',
    nothingOfKind: 'Nothing of this kind.',
    cancelled: 'Comparison cancelled.',
  },
  read: {
    tooMany: (collection: string) =>
      `${collection} has more than 1,000,000 documents to compare: narrow them with a filter.`,
    readingLeft: (count: string) => `Reading the left side… ${count} documents`,
    comparing: (right: string, left: string) => `Comparing with the right side… ${right} of ${left}+ documents`,
    details: (left: string, right: string) => `Reading the differences… (${left} left, ${right} right documents)`,
  },
  writes: {
    title: (source: string) => `Make like ${source}`,
    oneQuestion: (to: Side, verb: string, count: number, where: string) =>
      `Make ${sideWords[to]} like ${sideWords[to === 'left' ? 'right' : 'left']}: ${verb} ${documentsText(count)} in ${where}?`,
    asWritten: 'Documents are written as they are now on the other side.',
    manyQuestion: (to: Side, where: string) =>
      `Make ${sideWords[to]} like ${sideWords[to === 'left' ? 'right' : 'left']} in ${where}?`,
    copies: (parts: string, count: number, from: Side) =>
      `${parts} ${count === 1 ? 'document' : 'documents'} from the ${sideWords[from]} side.`,
    deletes: (count: number, to: Side) => `delete ${documentsText(count)} only on the ${sideWords[to]} side.`,
    canAlsoDelete: (count: number, to: Side) =>
      `${documentsText(count)} only on the ${sideWords[to]} side can also be deleted.`,
    keepThem: 'Keep them',
    deleteThem: 'Delete them',
    next: 'Continue',
    apply: 'Apply',
    delete: 'Delete',
    wrote: (written: number, deleted: number, where: string) =>
      written > 0 && deleted > 0
        ? `Wrote ${documentsText(written)}, deleted ${groupThousands(deleted)} in ${where}.`
        : written > 0
          ? `Wrote ${documentsText(written)} in ${where}.`
          : deleted > 0
            ? `Deleted ${groupThousands(deleted)} in ${where}.`
            : `Nothing changed in ${where}.`,
  },
  refusals: {
    readOnly: (connection: string) => `The connection ${connection} is read-only. Its documents can't be changed.`,
    view: (collection: string) => `${collection} is a view. Its documents can't be changed.`,
    comparing: 'Wait for the comparison to finish.',
    stale: 'Nothing to change: compare again.',
  },
  undo: { nothingWritten: 'Nothing is written, so there is nothing to undo.' },
} as const;
