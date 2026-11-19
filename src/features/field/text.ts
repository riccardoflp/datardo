/**
 * The text of the interface of the column actions, word for word as the cards of the field area write it (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

/** `3 documents`, `1 document`, with thousands separators. */
export function documentsText(count: number): string {
  return `${groupThousands(count)} ${count === 1 ? 'document' : 'documents'}`;
}

/** The text of the field area. */
export const text = {
  commands: {
    rename: 'Rename field…',
    remove: 'Remove field…',
    convert: 'Convert type…',
  },
  tooltips: {
    rename: '$rename in the documents matching the filter',
    remove: '$unset in the documents matching the filter',
    convert: 'Convert the values ($convert) in the documents matching the filter',
  },
  /** `<scope>`: *of people* for an empty filter, *matching the filter* otherwise. */
  scope: (collection: string, empty: boolean) => (empty ? `of ${collection}` : 'matching the filter'),
  readOnly: (connection: string) => `The connection ${connection} is read-only.`,
  view: 'Views are read-only.',
  invalidFilter: 'Invalid query syntax — check the highlighted field.',
  invalidPath: (field: string, reason: string) => `${field}: ${reason}.`,
  arrayElement: (label: string, array: string, action: string) =>
    `${label} is a field of the elements of the array ${array}: ${action} can't change fields inside arrays.`,
  arrayAdvice:
    'Use Update many with a pipeline that rewrites the array, e.g. [ { $set: { items: { $map: { input: "$items", in: … } } } } ].',
  noField: (scope: string, field: string) => `No document ${scope} has ${field}.`,
  emptyFilter: 'The filter is empty, so every document of the collection is affected.',
  paths: {
    enterName: 'Enter a field name',
    emptyPart: (path: string) => `"${path}" has an empty part: write names separated by single dots`,
    dollar: "Field names can't start with $",
    id: "_id can't be changed",
    different: 'Enter a different name',
    samePath: (from: string, to: string) =>
      `${from} and ${to} are on the same path: a field can't be moved inside itself or its parent`,
  },
  rename: {
    title: (field: string) => `Rename ${field}`,
    prompt: (field: string, scope: string) =>
      `New name of ${field} in the documents ${scope} (a dotted path moves it into a sub-document)`,
    button: 'Rename',
    question: (field: string, to: string, count: number, scope: string) =>
      `Rename ${field} to ${to} in ${documentsText(count)} ${scope}?`,
    overwrites: (count: number, to: string, field: string) =>
      count === 1
        ? `1 document already has ${to}: its value is replaced by that of ${field}.`
        : `${groupThousands(count)} documents already have ${to}: its value is replaced by that of ${field}.`,
    leftOut: (count: number, field: string, to: string) =>
      count === 1
        ? `1 document with ${field} or ${to} inside an array is left out: $rename can't go through arrays.`
        : `${groupThousands(count)} documents with ${field} or ${to} inside an array are left out: $rename can't go through arrays.`,
    confirm: 'Rename',
    confirmAll: 'Rename in all',
    action: '$rename',
    undo: (field: string, to: string) => `Rename field ${field} to ${to}`,
    done: (field: string, to: string, count: number, collection: string) =>
      `Renamed ${field} to ${to} in ${documentsText(count)} of ${collection}.`,
    layoutStep: (field: string, to: string, namespace: string) =>
      `move the column ${field} of ${namespace} to ${to} in its columns' layout`,
  },
  remove: {
    question: (field: string, count: number, scope: string) => `Remove ${field} from ${documentsText(count)} ${scope}?`,
    questionElements: (label: string, array: string, count: number, scope: string) =>
      `Remove ${label} from the elements of ${array} in ${documentsText(count)} ${scope}?`,
    leftOut: (count: number, field: string) =>
      count === 1
        ? `1 document where ${field} is inside an array is left out: remove it from the elements with Update many and $[].`
        : `${groupThousands(count)} documents where ${field} is inside an array are left out: remove it from the elements with Update many and $[].`,
    leftOutElements: (count: number, array: string) =>
      count === 1
        ? `1 document where ${array} isn't an array is left out.`
        : `${groupThousands(count)} documents where ${array} isn't an array are left out.`,
    confirm: 'Remove',
    confirmAll: 'Remove in all',
    undo: (label: string) => `Remove field ${label}`,
    done: (label: string, count: number, collection: string) =>
      `Removed ${label} from ${documentsText(count)} of ${collection}.`,
    layoutStep: (label: string, namespace: string) =>
      `remove the column ${label} from the columns' layout of ${namespace}`,
  },
  convert: {
    title: (field: string) => `Convert ${field}`,
    line: 'Type to convert the values to',
    now: (counts: readonly { readonly type: string; readonly count: number }[]) =>
      `now: ${counts.map((each) => `${each.type} ${groupThousands(each.count)}`).join(' · ')}`,
    button: 'Convert',
    question: (field: string, type: string, count: number, scope: string) =>
      `Convert ${field} to ${type} in ${documentsText(count)} ${scope}?`,
    keep: "Values that can't be converted keep their value and type; null and arrays are left as they are.",
    leftOut: (count: number, field: string) =>
      count === 1
        ? `1 document where ${field} is inside an array is left out.`
        : `${groupThousands(count)} documents where ${field} is inside an array are left out.`,
    confirm: 'Convert',
    confirmAll: 'Convert in all',
    action: 'Convert type',
    nothing: (field: string, scope: string, type: string) =>
      `No value of ${field} ${scope} needs converting to ${type}: null, missing values and arrays are left as they are.`,
    undo: (field: string, type: string) => `Convert field ${field} to ${type}`,
    done: (field: string, type: string, count: number, collection: string) =>
      `Converted ${field} to ${type} in ${documentsText(count)} of ${collection}.`,
    notConverted: (count: number) =>
      count === 1
        ? "1 value couldn't be converted and kept its type."
        : `${groupThousands(count)} values couldn't be converted and kept their type.`,
  },
  undoButton: 'Undo',
} as const;
