/**
 * The methods a script has on each object of the runtime (`playground.runtime`): the database, a collection, a
 * cursor, the connection and a session, each with the text autocomplete inserts (`|` is where the caret lands), and
 * the lists `playground.writes` checks. Ported from Mongoster's `src/playground/shell.ts` (`Shell.dbProxy`,
 * `Shell.collection`, `ShellCursor`, `ShellMongo`, `ShellSession`, `READ_COMMANDS`, `WRITE_STAGES`).
 */

/** A method and the text autocomplete inserts for it, with `|` for the caret. */
export type MethodWord = readonly [name: string, template: string];

/** The methods of `db`, in the order autocomplete lists them after the collections. */
export const databaseWords: readonly MethodWord[] = [
  ['getCollection', 'getCollection("|")'],
  ['getCollectionNames', 'getCollectionNames(|)'],
  ['getCollectionInfos', 'getCollectionInfos({ |})'],
  ['getName', 'getName(|)'],
  ['getSiblingDB', 'getSiblingDB("|")'],
  ['getMongo', 'getMongo(|)'],
  ['aggregate', 'aggregate([|])'],
  ['runCommand', 'runCommand({ |})'],
  ['adminCommand', 'adminCommand({ |})'],
  ['stats', 'stats(|)'],
  ['serverStatus', 'serverStatus(|)'],
  ['version', 'version(|)'],
  ['currentOp', 'currentOp(|)'],
  ['createCollection', 'createCollection("|")'],
  ['createView', 'createView("|", "", [])'],
  ['dropDatabase', 'dropDatabase(|)'],
];

/**
 * Every method of `db` (`playground.runtime`): those autocomplete lists, and `hostInfo`, which its worked example leaves
 * out. A database of a session has `getSession` too. Any other name is the collection of that name.
 */
export const databaseMethods: readonly string[] = [...databaseWords.map(([name]) => name), 'hostInfo'];

/** The methods of a collection, reading then writing, in the order autocomplete lists them. */
export const collectionWords: readonly MethodWord[] = [
  ['getName', 'getName(|)'],
  ['getFullName', 'getFullName(|)'],
  ['find', 'find({ |})'],
  ['findOne', 'findOne({ |})'],
  ['aggregate', 'aggregate([|])'],
  ['countDocuments', 'countDocuments({ |})'],
  ['count', 'count({ |})'],
  ['estimatedDocumentCount', 'estimatedDocumentCount(|)'],
  ['distinct', 'distinct("|")'],
  ['getIndexes', 'getIndexes(|)'],
  ['getSearchIndexes', 'getSearchIndexes(|)'],
  ['stats', 'stats(|)'],
  ['explain', 'explain(|)'],
  ['insertOne', 'insertOne({ |})'],
  ['insertMany', 'insertMany([|])'],
  ['insert', 'insert({ |})'],
  ['updateOne', 'updateOne({ |}, { $set: { } })'],
  ['updateMany', 'updateMany({ |}, { $set: { } })'],
  ['replaceOne', 'replaceOne({ |}, { })'],
  ['deleteOne', 'deleteOne({ |})'],
  ['deleteMany', 'deleteMany({ |})'],
  ['findOneAndUpdate', 'findOneAndUpdate({ |}, { $set: { } })'],
  ['findOneAndReplace', 'findOneAndReplace({ |}, { })'],
  ['findOneAndDelete', 'findOneAndDelete({ |})'],
  ['bulkWrite', 'bulkWrite([|])'],
  ['createIndex', 'createIndex({ |})'],
  ['createIndexes', 'createIndexes([|])'],
  ['dropIndex', 'dropIndex("|")'],
  ['dropIndexes', 'dropIndexes(|)'],
  ['createSearchIndex', 'createSearchIndex("|", { })'],
  ['updateSearchIndex', 'updateSearchIndex("|", { })'],
  ['dropSearchIndex', 'dropSearchIndex("|")'],
  ['drop', 'drop(|)'],
  ['renameCollection', 'renameCollection("|")'],
];

/** The methods of a collection. */
export const collectionMethods: readonly string[] = collectionWords.map(([name]) => name);

/** The methods of a cursor autocomplete suggests, in its order. */
export const cursorWords: readonly MethodWord[] = [
  ['sort', 'sort({ |})'],
  ['limit', 'limit(|)'],
  ['skip', 'skip(|)'],
  ['project', 'project({ |})'],
  ['toArray', 'toArray(|)'],
  ['count', 'count(|)'],
  ['forEach', 'forEach((document) => { |})'],
  ['map', 'map((document) => |)'],
  ['hint', 'hint({ |})'],
  ['collation', 'collation({ |})'],
  ['maxTimeMS', 'maxTimeMS(|)'],
  ['explain', 'explain(|)'],
  ['hasNext', 'hasNext(|)'],
  ['next', 'next(|)'],
  ['itcount', 'itcount(|)'],
];

/** The methods that shape a cursor and give it back: they send nothing. */
export const cursorShapes: readonly string[] = [
  'sort',
  'limit',
  'skip',
  'project',
  'projection',
  'hint',
  'collation',
  'comment',
  'maxTimeMS',
  'batchSize',
  'allowDiskUse',
  'pretty',
  'map',
];

/** The methods that read a cursor. `size` is `count`; `forEach` and `for await` read it with `next`. */
export const cursorReads: readonly string[] = [
  'toArray',
  'forEach',
  'hasNext',
  'next',
  'count',
  'itcount',
  'size',
  'explain',
];

/** The shaping methods the cursor of an aggregation lacks: *cursor.hint() is not available on this cursor*. */
export const missingOnAggregation: ReadonlySet<string> = new Set(['hint', 'collation', 'comment', 'allowDiskUse']);

/** The methods of `db.getMongo()`. */
export const mongoWords: readonly MethodWord[] = [
  ['startSession', 'startSession(|)'],
  ['getDB', 'getDB("|")'],
  ['getDBNames', 'getDBNames(|)'],
  ['getDBs', 'getDBs(|)'],
];

/** The methods of a session. */
export const sessionWords: readonly MethodWord[] = [
  ['getDatabase', 'getDatabase("|")'],
  ['startTransaction', 'startTransaction(|)'],
  ['commitTransaction', 'commitTransaction(|)'],
  ['abortTransaction', 'abortTransaction(|)'],
  ['withTransaction', 'withTransaction(() => { |})'],
  ['endSession', 'endSession(|)'],
  ['inTransaction', 'inTransaction(|)'],
  ['hasEnded', 'hasEnded(|)'],
  ['getSessionId', 'getSessionId(|)'],
  ['getClusterTime', 'getClusterTime(|)'],
  ['getOperationTime', 'getOperationTime(|)'],
  ['getMongo', 'getMongo(|)'],
];

/** The methods of a collection that write to its documents: those published for redis-oplog. */
export const documentWrites: ReadonlySet<string> = new Set([
  'insertOne',
  'insertMany',
  'insert',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
  'bulkWrite',
]);

/** Every method of a collection that writes, refused on a read-only connection (`playground.writes`). */
export const collectionWrites: ReadonlySet<string> = new Set([
  ...documentWrites,
  'createIndex',
  'createIndexes',
  'dropIndex',
  'dropIndexes',
  'createSearchIndex',
  'updateSearchIndex',
  'dropSearchIndex',
  'drop',
  'renameCollection',
]);

/** The methods of `db` that write, refused on a read-only connection. */
export const databaseWrites: ReadonlySet<string> = new Set(['createCollection', 'createView', 'dropDatabase']);

/** The commands `runCommand` and `adminCommand` run on a read-only connection; any other is refused. */
export const readCommands: ReadonlySet<string> = new Set([
  'find',
  'aggregate',
  'count',
  'distinct',
  'listCollections',
  'listIndexes',
  'listDatabases',
  'dbStats',
  'collStats',
  'serverStatus',
  'buildInfo',
  'buildinfo',
  'ping',
  'hello',
  'isMaster',
  'ismaster',
  'explain',
  'connectionStatus',
  'hostInfo',
  'getParameter',
  'currentOp',
  'top',
  'getLog',
  'replSetGetStatus',
  'getCmdLineOpts',
  'validate',
  'dataSize',
  'listCommands',
  'whatsmyuri',
  'features',
  'getMore',
  'profile',
]);

/** The stages that make a pipeline write. */
export const writeStages: readonly string[] = ['$out', '$merge'];
