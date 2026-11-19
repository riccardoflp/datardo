/**
 * Plans of test steps on documents and on keys, until the areas that write arrive (M12, M13): each names what the undo
 * history keeps (`undo: { keeps }`), and those on documents are published for redis-oplog. The unit, integration and
 * UI tests of the undo history and of redis-oplog run them; the product never lists them (`src/main/test-features.ts`
 * adds them only when `DATARDO_TEST=1`).
 */
import { keepsJson, keyNameOf } from '../features/undo/types';
import { redisCommand, utf8Bytes, type Json } from '../shared/engine-request';
import { run, type EngineStep, type OperationFeature, type Outcome } from '../shared/feature';
import { connectionId, featureId, type ConnectionId } from '../shared/ids';

type Fields = Readonly<Record<string, Json>>;

function fieldsOf(answers: Readonly<Record<string, unknown>>): Fields {
  const args = answers['args'];
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Fields) : {};
}

function textOf(fields: Fields, name: string): string {
  const value = fields[name];
  return typeof value === 'string' ? value : '';
}

function listOf(fields: Fields, name: string): readonly Json[] {
  const value = fields[name];
  return Array.isArray(value) ? (value as readonly Json[]) : [];
}

/** Where a plan on documents writes: the connection, the database and the collection of its arguments. */
function collectionOf(fields: Fields): {
  readonly connection: ConnectionId;
  readonly database: string;
  readonly collection: string;
} {
  return {
    connection: connectionId(textOf(fields, 'connection')),
    database: textOf(fields, 'database'),
    collection: textOf(fields, 'collection'),
  };
}

function documentStep(fields: Fields, method: string, args: readonly Json[], text: string): EngineStep {
  const { connection, database, collection } = collectionOf(fields);
  return {
    kind: 'engine',
    connection,
    writes: true,
    request: { engine: 'mongodb', database, collection, method, arguments: args },
    text,
  };
}

function documentsPlan(fields: Fields, step: EngineStep, keeps: Json, done: string): Outcome {
  const { connection, database, collection } = collectionOf(fields);
  return run({
    title: textOf(fields, 'title') || done,
    steps: [step],
    danger: { kind: 'confirm', text: `${done} in ${database}.${collection}?`, button: 'Continue' },
    undo: { keeps },
    publishes: true,
    after: [
      { kind: 'notify', level: 'success', text: `${done}.` },
      { kind: 'refresh', connection },
    ],
  });
}

/** `args`: `{ connection, database, collection, ids, set }` — `updateMany({ _id: { $in: ids } }, { $set: set })`. */
export const updateDocuments: OperationFeature = {
  kind: 'operation',
  id: featureId('test.update-documents'),
  plan: (_context, answers) => {
    const fields = fieldsOf(answers);
    const ids = listOf(fields, 'ids');
    const { database, collection } = collectionOf(fields);
    const step = documentStep(
      fields,
      'updateMany',
      [{ _id: { $in: [...ids] } }, { $set: fields['set'] ?? {} }],
      `db.${collection}.updateMany(…)`,
    );
    const keeps = keepsJson({ kind: 'ids', database, collection, ids });
    return documentsPlan(fields, step, keeps, `Update ${String(ids.length)} documents`);
  },
};

/** `args`: `{ connection, database, collection, documents }` — `insertMany(documents)`, each with its `_id`. */
export const insertDocuments: OperationFeature = {
  kind: 'operation',
  id: featureId('test.insert-documents'),
  plan: (_context, answers) => {
    const fields = fieldsOf(answers);
    const documents = listOf(fields, 'documents');
    const ids = documents.map((document) => (document as Fields)['_id'] ?? null);
    const { database, collection } = collectionOf(fields);
    const step = documentStep(fields, 'insertMany', [documents], `db.${collection}.insertMany(…)`);
    const keeps = keepsJson({ kind: 'inserted', database, collection, ids });
    return documentsPlan(fields, step, keeps, `Insert ${String(documents.length)} documents`);
  },
};

/** `args`: `{ connection, database, collection, filter }` — `deleteMany(filter)`. */
export const deleteDocuments: OperationFeature = {
  kind: 'operation',
  id: featureId('test.delete-documents'),
  plan: (_context, answers) => {
    const fields = fieldsOf(answers);
    const filter = fields['filter'] ?? {};
    const { database, collection } = collectionOf(fields);
    const step = documentStep(fields, 'deleteMany', [filter], `db.${collection}.deleteMany(…)`);
    const keeps = keepsJson({ kind: 'filter', database, collection, filter });
    return documentsPlan(fields, step, keeps, 'Delete documents');
  },
};

/** `args`: `{ connection, database, keys, value }` — `SET <key> <value>` for each key, or `DEL` without a value. */
export const writeKeys: OperationFeature = {
  kind: 'operation',
  id: featureId('test.write-keys'),
  plan: (_context, answers) => {
    const fields = fieldsOf(answers);
    const connection = connectionId(textOf(fields, 'connection'));
    const database = typeof fields['database'] === 'number' ? fields['database'] : 0;
    const keys = listOf(fields, 'keys').filter((key): key is string => typeof key === 'string');
    const value = fields['value'];
    const steps = keys.map((key): EngineStep => ({
      kind: 'engine',
      connection,
      writes: true,
      request:
        typeof value === 'string' ? redisCommand(database, 'SET', key, value) : redisCommand(database, 'DEL', key),
      text: typeof value === 'string' ? `SET ${key} ${value}` : `DEL ${key}`,
    }));
    const done = `${typeof value === 'string' ? 'Set' : 'Delete'} ${String(keys.length)} keys`;
    return run({
      title: done,
      steps,
      danger: { kind: 'confirm', text: `${done} in db${String(database)}?`, button: 'Continue' },
      undo: { keeps: keepsJson({ kind: 'keys', database, keys: keys.map((key) => keyNameOf(utf8Bytes(key))) }) },
      publishes: false,
      after: [
        { kind: 'notify', level: 'success', text: `${done}.` },
        { kind: 'refresh', connection },
      ],
    });
  },
};

/** The plans of test steps, as the runner starts them. */
export const testPlans: readonly OperationFeature[] = [updateDocuments, insertDocuments, deleteDocuments, writeKeys];
