/**
 * The text of the interface of the transfer area, word for word as the cards write it (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

/** `1 document`, `3 documents`, with the thousands grouped. */
export function counted(count: number, singular: string, plural = `${singular}s`): string {
  return `${groupThousands(count)} ${count === 1 ? singular : plural}`;
}

/** What a copy or a generation did, for its message. */
export interface InsertTotals {
  readonly inserted: number;
  readonly total: number;
  readonly skipped: number;
  readonly failed: number;
  readonly firstError?: string;
  readonly indexes: number;
  readonly indexErrors: readonly string[];
  /** Why it could not be recorded in the undo history, when it could not: `12,000 documents`, `more than 20 MB`. */
  readonly overflow?: string;
}

/** The lines of `undo.note` a confirmation shows when the write will not be recorded. */
export const undoText = {
  off: "The undo history is off for this connection: this can't be undone.",
  overLimit: (most: number): string =>
    `This can't be undone: the undo history keeps operations of up to ${counted(most, 'document')}.`,
} as const;

/** The questions of a destination: a connection, a database (or a new one), a collection. */
export const destinationText = {
  sameConnection: 'same connection',
  readOnly: 'read-only',
  newDatabase: 'New database…',
  newDatabaseStep: 'new database',
  newDatabasePrompt: (connection: string): string => `Database name on ${connection}`,
  databaseExists: 'This database already exists',
  databaseNeeded: 'Enter a database name',
  collectionNeeded: 'Enter a collection name',
  databaseStep: (connection: string): string => `database on ${connection}`,
  connectionStep: 'destination connection',
  collectionStep: 'destination collection',
  choose: 'Choose',
  next: 'Next',
} as const;

/** The text of **Copy collection to…** (`transfer.copy-collection`). */
export const copyText = {
  command: 'Copy collection to…',
  title: (namespace: string, step: string): string => `Copy ${namespace}: ${step}`,
  where: 'Where the copy goes',
  collectionPrompt: (connection: string, database: string): string =>
    `Collection in ${connection} › ${database} (an existing one can be appended to or replaced)`,
  beingCopied: 'That is the collection being copied',
  viewName: 'A view has this name',
  existsStep: (collection: string, connection: string, database: string): string =>
    `${collection} exists in ${connection} › ${database}`,
  modes: {
    append: { label: 'Append', description: 'insert the documents; those whose _id already exists are skipped' },
    replace: {
      label: 'Replace matching',
      description: 'documents with the same _id are replaced, the others inserted',
    },
    drop: {
      label: 'Drop and recreate',
      description: (count: string, collection: string): string =>
        `the ${count} documents and indexes of ${collection} are deleted first`,
    },
  },
  filterStep: 'filter (optional)',
  filterPrompt: 'Only the documents matching this filter are copied; leave empty for all',
  filterExample: '{ status: "active", createdAt: { $gte: ISODate("2024-01-01") } }',
  alsoStep: 'also copy',
  indexes: 'Indexes',
  indexesBesides: (count: number): string => `${groupThousands(count)} besides _id`,
  options: 'Collection options',
  optionsDescription: 'validation rules, capped size, collation, time series…',
  confirm: (count: number, source: string, destination: string): string =>
    `Copy ${counted(count, 'document')} of ${source} to ${destination}?`,
  verbs: {
    new: 'into the new collection',
    append: 'appending to',
    replace: 'replacing matching documents in',
    drop: 'dropping and recreating',
  },
  destinationLine: (verb: string, destination: string): string => `Destination: ${verb} ${destination}.`,
  filterLine: (filter: string): string => `Filter: ${filter}`,
  allDocuments: 'All documents.',
  indexesAfter: 'Indexes are created after the documents.',
  withOptions: 'The collection is created with the options of the source.',
  cannotUndo: "Dropping the destination can't be undone.",
  button: 'Copy',
  undoTitle: (source: string): string => `Copy ${source}`,
  undoTitleFiltered: (source: string): string => `Copy filtered ${source}`,
  readOnly: (connection: string): string => `The connection ${connection} is read-only: it can't receive a copy.`,
  progressTitle: (namespace: string, destination: string): string => `Copying ${namespace} → ${destination}`,
  progress: (done: number, total: number): string => `${groupThousands(done)} of ${counted(total, 'document')}`,
  done: (totals: InsertTotals, destination: string, seconds: string): string => {
    const indexes = totals.indexes > 0 ? ` and ${counted(totals.indexes, 'index', 'indexes')}` : '';
    return `Copied ${counted(totals.inserted, 'document')}${indexes} to ${destination} in ${seconds} s.`;
  },
  skipped: (count: number): string => `${groupThousands(count)} skipped (their _id already existed)`,
  failedSome: (count: number, error: string): string => `${groupThousands(count)} failed: ${error}`,
  indexNotCreated: (index: string): string => `Index not created — ${index}`,
  overflow: (why: string): string => `It can't be undone: ${why}, too many for the undo history`,
  cancelled: (done: number, total: number, destination: string): string =>
    `Copy cancelled after ${groupThousands(done)} of ${counted(total, 'document')}; those stay in ${destination}.`,
  failed: (error: string): string => `Copy failed: ${error}`,
  open: 'Open',
} as const;

/** The text of **Export** (`transfer.export`). */
export const exportText = {
  command: 'Export collection…',
  title: (collection: string): string => `Export ${collection}`,
  scopeTitle: (collection: string, format: string): string => `Export ${collection} as ${format}`,
  formats: {
    json: { label: 'JSON', description: 'Array of documents, readable (relaxed Extended JSON)' },
    jsonl: {
      label: 'JSON Lines',
      description: 'One document per line, canonical Extended JSON: keeps every type, re-importable',
    },
    csv: { label: 'CSV', description: 'The columns shown in the table; expanded arrays give one row per element' },
  },
  allResults: (count: number | undefined): string =>
    count === undefined ? 'All results' : `All results (${counted(count, 'document')})`,
  currentPage: (first: number, last: number): string =>
    `Current page (${groupThousands(first)}–${groupThousands(last)})`,
  save: 'Export',
  choose: 'Choose',
  planTitle: (collection: string): string => `Export ${collection}`,
  cannotUndo: 'An export writes a file, not a deployment: there is nothing to undo.',
  writes: (stage: string): string =>
    `Export failed: A pipeline ending with ${stage} writes to the database and can't be exported. ` +
    'Select an earlier stage to export its output.',
  invalid: (error: string): string => `Export failed: ${error}`,
  progressTitle: (collection: string): string => `Exporting ${collection}`,
  progress: (documents: number): string => counted(documents, 'document'),
  done: (documents: number, file: string): string => `Exported ${counted(documents, 'document')} to ${file}.`,
  open: 'Open',
  reveal: 'Reveal',
  cancelled: 'Export cancelled.',
  failed: (error: string): string => `Export failed: ${error}`,
} as const;

/** The text of **Import documents…** (`transfer.import`) and of reading its file (`transfer.import-files`). */
export const importText = {
  command: 'Import documents…',
  title: (namespace: string): string => `Import into ${namespace}`,
  filter: 'JSON, JSON Lines, CSV',
  allFiles: 'All files',
  open: 'Import',
  confirm: (count: number, file: string, namespace: string): string =>
    `Import ${counted(count, 'document')} from ${file} into ${namespace}?`,
  withIds: (count: number): string =>
    `${groupThousands(count)} of them have an _id: documents whose _id already exists are skipped.`,
  newIds: 'New _id values will be generated.',
  button: 'Import',
  undoTitle: (file: string): string => `Import ${file}`,
  readOnly: (namespace: string): string => `${namespace} is read-only.`,
  unreadable: (file: string, error: string): string => `Can't import ${file}: ${error}`,
  empty: (file: string): string => `${file} contains no documents.`,
  progressTitle: (file: string): string => `Importing ${file}`,
  progress: (done: number, total: number): string => `${groupThousands(done)} of ${groupThousands(total)}`,
  done: (inserted: number, total: number, collection: string): string =>
    `Imported ${groupThousands(inserted)} of ${counted(total, 'document')} into ${collection}.`,
  failedSome: (count: number, error: string): string => `${groupThousands(count)} failed: ${error}`,
  failed: (error: string): string => `Import failed: ${error}`,
  notRead: (path: string): string => `${path} could not be read`,
  expectedArray: 'Expected an array of documents',
  notAnObject: (index: number): string => `Document ${groupThousands(index)} is not an object`,
  line: (line: number, error: string): string => `Line ${groupThousands(line)}: ${error}`,
  tooLarge: (most: string): string => `The file is larger than ${most}`,
  tooDeep: (most: number): string => `A document is nested deeper than ${String(most)} levels`,
} as const;

/** What reading CSV says when it cannot (`transfer.csv-read`). */
export const csvText = {
  unterminated: 'Unterminated quoted field',
  rowFields: (row: number, fields: number, header: number): string =>
    `Row ${groupThousands(row)} has ${groupThousands(fields)} fields, the header has ${groupThousands(header)}`,
} as const;

/** The text of **Generate test documents…** (`transfer.generate`). */
export const generateText = {
  command: 'Generate test documents…',
  title: (namespace: string, step: string): string => `Generate documents like ${namespace}: ${step}`,
  analyzing: (namespace: string): string => `Analyzing a sample of ${namespace}`,
  howManyStep: 'how many',
  howManyPrompt: (analyzed: number): string =>
    `Number of documents to generate (up to 1,000,000), like the ${groupThousands(analyzed)} analyzed`,
  wholeNumber: 'A whole number from 1 to 1,000,000',
  destinationStep: 'destination',
  thisCollection: 'This collection',
  anotherCollection: 'Another collection…',
  anotherDescription: 'new or existing, on any connection',
  where: 'Where the generated documents go',
  collectionPrompt: (connection: string, database: string): string =>
    `Collection in ${connection} › ${database}: a new one, or an existing one to add the documents to`,
  viewName: 'A view has this name: views are read-only',
  seedStep: 'seed (optional)',
  seedPrompt:
    'The same seed and analysis give the same documents (new ObjectId _ids still differ); leave empty for random ones',
  seedExample: 'e.g. 42',
  confirm: (count: number, destination: string): string =>
    `Insert ${counted(count, 'generated document')} into ${destination}?`,
  lookLike: (analyzed: string): string => `They look like the ${analyzed}. For example:`,
  analyzed: (count: number, source: string, filter: string, seed: string): string =>
    `${counted(count, 'document')} analyzed in ${source}${filter === '' ? '' : ` matching ${filter}`}` +
    (seed === '' ? '' : `, seed ${seed}`),
  notPublished: 'Like Import, the inserts are not published to Redis for redis-oplog.',
  button: 'Insert',
  undoTitle: (count: number, namespace: string): string => `Generate ${counted(count, 'document')} like ${namespace}`,
  readOnly: (connection: string): string => `The connection ${connection} is read-only.`,
  nothingInCollection: (namespace: string): string => `${namespace} has no documents to imitate.`,
  nothingMatches: 'No documents match the filter: there is nothing to imitate.',
  couldNotAnalyze: (namespace: string, error: string): string => `Could not analyze ${namespace}: ${error}`,
  progressTitle: (destination: string): string => `Generating documents into ${destination}`,
  progress: (done: number, total: number): string => `${groupThousands(done)} of ${counted(total, 'document')}`,
  done: (inserted: number, destination: string, seconds: string): string =>
    `Inserted ${counted(inserted, 'generated document')} into ${destination} in ${seconds} s.`,
  failedSome: (count: number, error: string): string => `${groupThousands(count)} failed: ${error}`,
  cancelled: (done: number, total: number, destination: string): string =>
    `Generation cancelled after ${groupThousands(done)} of ${counted(total, 'document')}; those stay in ${destination}.`,
  failed: (inserted: number, error: string): string =>
    `Generating documents failed after ${groupThousands(inserted)} inserted: ${error}`,
  open: 'Open',
} as const;
