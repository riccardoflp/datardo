/**
 * The text of the interface of the document area, word for word as its cards write it (R10.1), with Datardo's numbers
 * written with a comma every three digits (`1,204`).
 */
import { groupThousands } from '../../shared/text-units';

/** `3 documents`, `1 document`. */
export function documentsText(count: number): string {
  return `${groupThousands(count)} ${count === 1 ? 'document' : 'documents'}`;
}

/** *12 documents match the filter.*, *1 document matches the filter.*, *No documents match the filter.* */
function matchText(count: number): string {
  if (count === 0) {
    return 'No documents match the filter.';
  }
  return count === 1 ? '1 document matches the filter.' : `${groupThousands(count)} documents match the filter.`;
}

const readOnly = (name: string): string => `The connection ${name} is read-only.`;
const notFound = 'Document not found: it may have been deleted.';
const notFoundAlready = 'Document not found: it may have been deleted already.';
const notADocument = 'A document must be an object { … }';
const emptyFilterDetail = 'The filter is empty, so every document of the collection is affected.';

/** The text of the document area. */
export const text = {
  commands: {
    inspect: 'Inspect document',
    open: 'Open document in a tab',
    inlineEdit: 'Edit value',
    save: 'Save document',
    insert: 'Insert documents…',
    duplicate: 'Duplicate document…',
    delete: 'Delete document',
    updateMany: 'Update many…',
    deleteMany: 'Delete many…',
  },
  refusals: {
    readOnly,
    view: 'Views are read-only.',
    notFound,
    notFoundAlready,
    notADocument,
    invalidDocument: (message: string) => `Invalid document: ${message}`,
  },
  undo: {
    recorded: 'It can be undone from the Undo history.',
    off: "The undo history is off for this connection: this can't be undone.",
    overLimit: (most: number) =>
      `This can't be undone: the undo history keeps operations of up to ${documentsText(most)}.`,
    nothingWritten: 'Nothing is written, so there is nothing to undo.',
  },
  copied: 'Copied to the clipboard',
  copy: {
    value: 'Copy value',
    path: 'Copy field path',
  },
  inlineEdit: {
    hint: 'Enter to save · Shift+Enter new line · Esc to cancel',
    title: (path: string, id: string) => `Edit ${path} of ${id}`,
    button: 'Save',
    changed: (path: string, value: string) =>
      `${path} was changed to ${value} in the database after it was loaded. Overwrite it?`,
    removed: (path: string) => `${path} was removed in the database after it was loaded. Overwrite it?`,
    overwrite: 'Overwrite',
    notSaved: 'Not saved: the value changed in the database.',
    id: '_id cannot be changed.',
    changedAgain: (path: string) => `${path} changed again in the database: refresh and retry.`,
  },
  save: {
    title: (id: string) => `Edit document ${id}`,
    changed: 'This document was changed in the database after you opened it.',
    changedDetail: 'Overwrite replaces those changes with yours. Revert loads the latest version instead.',
    overwrite: 'Overwrite',
    deleted: 'This document was deleted from the database after you opened it.',
    insertAgain: 'Insert again',
    id: '_id cannot be changed. Use Duplicate to create a copy with a new _id.',
  },
  insert: {
    title: (collection: string) => `Insert into ${collection}`,
    hint: 'One document { … } or several [ { … }, { … } ], in mongosh syntax or Extended JSON: paste what Copy gives. ObjectId(…), ISODate(…) and NumberLong(…) keep their types; without _id one is generated.',
    toInsert: (count: number) => `${groupThousands(count)} document(s) to insert`,
    button: (count: number) => (count > 1 ? `Insert ${groupThousands(count)} documents` : 'Insert'),
    inserting: 'Inserting…',
    template: 'Template',
    templateTooltip: 'Start from the fields most documents of the collection have',
    openInTab: 'Open in a tab',
    openInTabTooltip: 'Edit in a document tab instead: saving it (Ctrl+S) inserts the document',
    openInTabSeveral: 'A document tab inserts one document: use Insert for several',
    keepOpen: 'Keep open',
    keepOpenTooltip: 'Stay open after inserting, to insert more',
    cancel: 'Cancel',
    planOne: 'Insert document',
    planMany: (count: number) => `Insert ${groupThousands(count)} documents`,
    insertedOne: (id: string, collection: string) => `Inserted document ${id} into ${collection}.`,
    insertedMany: (count: number, collection: string) =>
      `Inserted ${groupThousands(count)} documents into ${collection}.`,
    insertedSome: (inserted: number, count: number, collection: string) =>
      `Inserted ${groupThousands(inserted)} of ${groupThousands(count)} documents into ${collection}.`,
    insertedThen: (inserted: number, count: number, error: string) =>
      `Inserted ${groupThousands(inserted)} of ${groupThousands(count)} documents, then: ${error}`,
    duplicateId: '. Remove _id to insert a copy with a new one.',
  },
  insertFromTab: {
    inserted: (id: string) => `Inserted document ${id}`,
  },
  parse: {
    empty: 'Enter a document, e.g. { name: "Ada" }',
    emptyArray: 'The array is empty: add the documents to insert',
    notADocument,
    item: (index: number) => `Item ${String(index)} is not a document: each must be an object { … }`,
  },
  duplicate: {
    title: 'Duplicate document',
    tooltip: 'Insert a copy without _id',
    menu: 'Duplicate…',
  },
  delete: {
    title: (id: string) => `Delete document ${id}`,
    question: (id: string, collection: string) => `Delete document ${id} from ${collection}?`,
    button: 'Delete',
    deleted: (id: string, collection: string) => `Deleted document ${id} from ${collection}.`,
    failed: (error: string) => `Delete failed: ${error}`,
  },
  deleteSelected: {
    title: (count: number, ids: string) => `Delete ${documentsText(count)} ${ids}`,
    question: (count: number, collection: string) => `Delete ${documentsText(count)} from ${collection}?`,
    selected: (count: number) => `The ${groupThousands(count)} documents selected in the table.`,
    entry: (count: number) => `Delete ${documentsText(count)}…`,
    tooltip: 'After a confirmation (Delete)',
    deleted: (count: number, collection: string) => `Deleted ${documentsText(count)} from ${collection}.`,
    deletedSome: (deleted: number, count: number, collection: string) =>
      `Deleted ${groupThousands(deleted)} of ${groupThousands(count)} documents from ${collection}: the others were already gone.`,
  },
  many: {
    noFilter: '{ }  — no filter: every document of the collection',
    counting: 'Counting matching documents…',
    match: matchText,
    emptyFilterDetail,
    invalidFilter: 'Invalid query syntax — check the highlighted field.',
    filterProblem: (message: string) => `Filter: ${message}`,
  },
  updateMany: {
    form: (collection: string) => `Update many · ${collection}`,
    entry: 'Update many…',
    tooltip: 'Update every document matching the filter',
    field: 'Update',
    placeholder: '{ $set: { status: "archived" }, $inc: { version: 1 } }',
    continue: 'Continue',
    empty: 'Enter the changes, e.g. { $set: { field: "value" } }',
    operators:
      'Update: use update operators like { $set: { field: "value" } } (a plain document would replace whole documents)',
    pipeline: 'Update: a pipeline is a list of stages like { $set: { … } }',
    problem: (message: string) => `Update: ${message}`,
    title: (filter: string, update: string) => `Update many ${filter} with ${update}`,
    button: (count: number) => `Update ${documentsText(count)}`,
    all: (count: number, collection: string) => `Update all ${groupThousands(count)} documents of ${collection}?`,
    allButton: 'Update all',
    updated: (collection: string, matched: number, modified: number) =>
      `Updated ${collection}: ${groupThousands(matched)} matched, ${groupThousands(modified)} modified.`,
  },
  updateSelected: {
    entry: (count: number) => `Update ${documentsText(count)}…`,
    tooltip: 'Update many, with the filter on their _id',
  },
  deleteMany: {
    form: (collection: string) => `Delete many · ${collection}`,
    entry: 'Delete many…',
    tooltip: 'Delete every document matching the filter',
    title: (filter: string) => `Delete many ${filter}`,
    button: (count: number) => `Delete ${documentsText(count)}`,
    all: (count: number, collection: string) => `Delete all ${groupThousands(count)} documents of ${collection}?`,
    allButton: 'Delete all',
    deleted: (count: number, collection: string) => `Deleted ${documentsText(count)} from ${collection}.`,
  },
  restore: {
    readOnly: (name: string) => `The connection ${name} is read-only: nothing can be restored through it.`,
    notConnected: 'The connection no longer exists.',
    partial: 'Only a version whose fields are all known can be restored.',
    same: 'The document is already as it was in this version.',
    title: (id: string, at: string) => `Restore ${id} as of ${at}`,
    question: (id: string, at: string) => `Restore ${id} as of ${at}?`,
    replaces: (namespace: string, differing: number) =>
      `It replaces the document as it is now in ${namespace}: ${differing === 1 ? '1 field differs.' : `${groupThousands(differing)} fields differ.`}`,
    button: 'Restore',
    insertQuestion: (id: string, at: string) => `Insert ${id} as of ${at} again?`,
    insertDetail: (namespace: string) => `The document was deleted: it is inserted again in ${namespace}.`,
    insertButton: 'Insert again',
    restored: (id: string, at: string) => `Restored ${id} as of ${at}.`,
    inserted: (id: string, at: string) => `Inserted ${id} as of ${at} again.`,
    deletedMeanwhile: 'Restore failed: The document was deleted meanwhile: restore again to insert it.',
    failed: (error: string) => `Restore failed: ${error}`,
  },
  inspect: {
    nothing: 'Select a document to inspect it.',
    several: (count: number) => `${groupThousands(count)} documents selected`,
    previous: 'Previous document',
    next: 'Next document',
    expandAll: 'Expand all',
    collapseAll: 'Collapse all',
    tree: 'Tree',
    text: 'Text',
    copyAs: 'Copy as',
    openInTab: 'Open in a tab',
    duplicate: 'Duplicate…',
    delete: 'Delete document',
    goFromHere: 'Go from here',
    history: 'History',
    noId: 'Not available: the document has no _id (excluded by the projection?)',
    tooltip: (position: number, id: string) => `Document ${groupThousands(position)} · ${id}`,
    fields: (count: number) => `${groupThousands(count)} ${count === 1 ? 'field' : 'fields'}`,
    items: (count: number) => `${groupThousands(count)} ${count === 1 ? 'item' : 'items'}`,
  },
  open: {
    newDocument: (number: number) => `New document ${String(number)}`,
    save: 'Save',
    insert: 'Insert',
    revert: 'Revert',
    discard: (id: string) => `Discard your changes to ${id}?`,
    discardButton: 'Discard',
    history: 'History',
    copyAs: 'Copy as',
    loading: 'Loading…',
    readOnlyMark: 'Read-only',
    gone: (namespace: string) => `This document no longer exists in ${namespace}.`,
    retry: 'Retry',
    noHistory: 'Open a document of a collection first: a new document has no history yet.',
  },
};
