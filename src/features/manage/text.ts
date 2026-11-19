/**
 * The text of the manage area: the questions, confirmations, refusals and notifications of the features that create,
 * rename and drop databases and collections, and of the Definition and Validation sections.
 */
import { groupThousands } from '../../shared/text-units';

/** `1 document`, `1,234 documents`. */
function counted(count: number, one: string, many: string): string {
  return `${groupThousands(count)} ${count === 1 ? one : many}`;
}

/** The text of the manage area. */
export const text = {
  readOnly: (name: string): string => `The connection ${name} is read-only.`,
  cannotUndo: 'This cannot be undone.',
  notADocumentWrite: 'Creating a collection is not a write to documents: it is not in the undo history.',
  nothingWritten: 'No document is written: it is not in the undo history.',
  pick: {
    database: 'Database',
    collection: 'Collection',
    button: 'Choose',
  },
  names: {
    empty: 'Enter a name',
    databaseCharacters: 'A database name cannot contain spaces or / \\ . " $ * < > : | ?',
    databaseLength: 'A database name is at most 63 bytes',
    collectionDollar: 'A collection name cannot contain $',
    collectionSystem: 'Names starting with "system." are reserved',
    collectionDot: 'A collection name cannot start or end with a dot',
    databaseExists: 'This database already exists',
    collectionExists: 'This collection already exists',
    renameExists: 'A collection with this name already exists',
  },
  createDatabase: {
    title: 'Create database',
    databaseField: (connection: string): string => `Database name on ${connection}`,
    collectionField: 'Name of its first collection (MongoDB creates a database together with a collection)',
    button: 'Create',
    created: (database: string, collection: string): string => `Created the database ${database} with ${collection}.`,
  },
  createCollection: {
    pickTitle: 'Create collection',
    title: (database: string): string => `Create collection in ${database}`,
    nameField: 'Collection name',
    optionsField: 'Options, optional: leave empty for a regular collection',
    placeholder: '{ capped: true, size: 1048576 }  or  { timeseries: { timeField: "ts" } }',
    button: 'Create',
    invalidOptions: (message: string): string => `Options: ${message}`,
    notAnObject: 'Options must be an object',
    created: (namespace: string): string => `Created the collection ${namespace}.`,
  },
  renameCollection: {
    pickTitle: 'Rename collection',
    title: (namespace: string): string => `Rename collection ${namespace}`,
    field: 'New name',
    button: 'Rename',
    view: 'Views cannot be renamed.',
    moveStep: (from: string, to: string): string => `move what Datardo keeps for ${from} to ${to}`,
    renamed: (from: string, to: string): string => `Renamed ${from} to ${to}.`,
  },
  dropCollection: {
    pickTitle: 'Drop collection',
    title: (namespace: string): string => `Drop collection ${namespace}`,
    viewTitle: (namespace: string): string => `Drop view ${namespace}?`,
    deletes: (documents: number | undefined, indexes: number | undefined): string => {
      const parts = [
        ...(documents === undefined ? [] : [counted(documents, 'document', 'documents')]),
        ...(indexes === undefined ? [] : [counted(indexes, 'index', 'indexes')]),
      ];
      return parts.length === 0 ? 'This cannot be undone.' : `Deletes ${parts.join(' and ')}. This cannot be undone.`;
    },
    view: 'The documents of its source collection are not affected.\nThis cannot be undone.',
    button: 'Drop',
    dropped: (namespace: string): string => `Dropped ${namespace}.`,
    cannotUndo: 'Nothing is kept: a collection can be larger than the undo history may hold.',
  },
  dropDatabase: {
    pickTitle: 'Drop database',
    title: (database: string): string => `Drop database ${database}`,
    deletes: (collections: number | undefined): string =>
      collections === undefined
        ? 'This cannot be undone.'
        : `Deletes ${counted(collections, 'collection', 'collections')} with all their documents. This cannot be undone.`,
    button: 'Drop',
    dropped: (database: string): string => `Dropped the database ${database}.`,
    cannotUndo: 'Nothing is kept.',
  },
  definition: {
    invalid: (message: string): string => `Invalid definition: ${message}`,
    notAnObject: 'The definition must be an object',
    viewOn: 'viewOn: the name of the source collection or view',
    pipeline: 'pipeline: an array of stages',
    unknownViewField: (name: string): string => `Unknown field ${name}: a view has viewOn and pipeline`,
    unknownRulesField: (name: string): string =>
      `Unknown field ${name}: use validator, validationLevel, validationAction`,
    validator: 'validator must be an object ({} removes the rules)',
    noValidation: 'Views have no validation rules.',
    notApplied: (message: string): string => `Not applied: ${message}`,
  },
  editView: {
    title: (namespace: string): string => `Save view ${namespace}`,
    saved: (namespace: string): string => `Saved view ${namespace}.`,
    cannotUndo: 'The definition is not a document, and the one before is not kept.',
  },
  editValidation: {
    title: (namespace: string): string => `Apply the validation rules of ${namespace}`,
    applied: (namespace: string): string => `Applied the validation rules of ${namespace}.`,
    cannotUndo: 'The rules are not a document, and those before are not kept.',
  },
  section: {
    save: 'Save',
    saveShortcut: 'Ctrl+S',
    discard: 'Discard changes',
    reload: 'Reload',
    readOnly: 'Read-only',
    discardTitle: (namespace: string): string => `Discard your changes to the definition of ${namespace}?`,
    discardButton: 'Discard',
    viewGone: (namespace: string): string => `The view ${namespace} no longer exists.`,
    collectionGone: (namespace: string): string => `The collection ${namespace} no longer exists.`,
    loading: 'Reading…',
    sampling: (size: number): string => `Reading ${groupThousands(size)} documents to propose rules…`,
    generated: (collection: string, sampled: number): string =>
      `${collection} has no validation rules: this $jsonSchema was generated from ` +
      `${counted(sampled, 'document', 'documents')}. Review it, then save (Ctrl+S) to apply it. ` +
      'validationAction "warn" only logs invalid documents.',
    noRules: (collection: string): string => `${collection} has no validation rules.`,
    discardRulesTitle: (namespace: string): string => `Discard your changes to the validation rules of ${namespace}?`,
    pickView: 'Edit view definition',
    pickCollection: 'Edit validation rules',
    definitionTitle: (namespace: string): string => `Show the definition of ${namespace}`,
    validationTitle: (namespace: string): string => `Show the validation rules of ${namespace}`,
  },
  commands: {
    createDatabase: 'Create database…',
    createCollection: 'Create collection…',
    renameCollection: 'Rename collection…',
    dropCollection: 'Drop collection…',
    dropDatabase: 'Drop database…',
    definition: 'Edit view definition…',
    editView: 'Save view definition',
    validation: 'Edit validation rules…',
    editValidation: 'Save validation rules',
  },
} as const;
