/**
 * Records the replies of the reads and the writes of the document area from the throwaway MongoDB into
 * `test/fixtures/replies/`, named after the server version they came from (testing.md). It runs only when
 * `DATARDO_RECORD_REPLIES=1`: the requests are those the features build, sent as the runner sends them, and the unit
 * tests of the document area read the recorded files, which change only when they are recorded again.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import * as deleteOne from '../../../src/features/document/delete';
import * as deleteSelected from '../../../src/features/document/delete-selected';
import * as inlineEdit from '../../../src/features/document/inline-edit';
import * as insert from '../../../src/features/document/insert';
import * as read from '../../../src/features/document/read';
import * as save from '../../../src/features/document/save';
import * as updateMany from '../../../src/features/document/update-many';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers, Context, Outcome } from '../../../src/shared/feature';
import { contextOn, double, int, local, long } from '../../unit/document/context';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const database = 'shop';
const collection = 'people';

/** The document of every type the recorded reads return. */
const typed: Json = {
  _id: int(7),
  name: 'Ada',
  qty: int(3),
  price: double('5.5'),
  big: long('9007199254740993'),
  amount: { $numberDecimal: '1.10' },
  pattern: { $regularExpression: { pattern: '^a', options: 'i' } },
  createdAt: { $date: { $numberLong: '1710496800000' } },
  items: [{ qty: int(1) }, { qty: int(2) }, { qty: int(3) }],
  address: { city: 'Rome' },
};

const others: readonly Json[] = [
  { _id: double('1.0'), name: 'Double id' },
  { _id: int(2), status: 'new' },
  { _id: int(3), status: 'new' },
  { _id: int(5), status: 'new' },
];

async function send(engines: EngineService, method: string, args: readonly Json[]): Promise<unknown> {
  return engines.send(
    { connection: local.id, request: { engine: 'mongodb', database, collection, method, arguments: args } },
    AbortSignal.timeout(20_000),
  );
}

async function keep(name: string, reply: unknown): Promise<unknown> {
  await writeFile(join(folder, `mongodb-8.2-document-${name}.json`), `${JSON.stringify(reply, null, 2)}\n`);
  return reply;
}

async function readReply(engines: EngineService, context: Context, args: Json): Promise<unknown> {
  const [request] = read.request(context, args).requests;
  if (request === undefined) {
    throw new Error('document.read sent nothing.');
  }
  return engines.send(request, AbortSignal.timeout(20_000));
}

/** Sends the first step of the plan an outcome must be, and returns the reply. */
async function sendStep(engines: EngineService, outcome: Outcome): Promise<unknown> {
  const step = outcome.kind === 'run' ? outcome.plan.steps[0] : undefined;
  if (step?.kind !== 'engine') {
    throw new Error(`Expected a plan with a step, got ${JSON.stringify(outcome)}`);
  }
  return engines.send(step, AbortSignal.timeout(20_000));
}

async function recordReads(engines: EngineService): Promise<void> {
  const context = contextOn('document.read');
  const where = { connection: local.id, database, collection };
  await keep('find-types', await readReply(engines, context, { ...where, id: int(7) }));
  await keep('find-double-id', await readReply(engines, context, { ...where, id: int(1) }));
  await keep('find-missing', await readReply(engines, context, { ...where, id: int(404) }));
  await keep('find-projection', await readReply(engines, context, { ...where, id: int(7), field: 'qty' }));
}

async function recordEdits(engines: EngineService): Promise<void> {
  const context = contextOn('document.inline-edit');
  const current = read.parse([
    await readReply(engines, context, { connection: local.id, database, collection, id: int(7) }),
  ]);
  const edit = (path: string, value: Json, typedText: string): Answers => ({
    args: { id: int(7), path, value },
    value: typedText,
    current,
  });
  const qty = inlineEdit.plan(context, edit('qty', int(3), '5'));
  await keep('updateOne', await sendStep(engines, qty));
  await keep('updateOne-changed-again', await sendStep(engines, qty));
  await sendStep(engines, inlineEdit.plan(context, edit('price', double('5.5'), '6')));
  await sendStep(engines, inlineEdit.plan(context, edit('big', long('9007199254740993'), '7')));
  await sendStep(engines, inlineEdit.plan(context, edit('items.2.qty', int(3), '30')));
  await keep(
    'find-after-edit',
    await readReply(engines, context, { connection: local.id, database, collection, id: int(7) }),
  );
}

async function recordWrites(engines: EngineService): Promise<void> {
  const inserted = (text: string): Outcome => insert.plan(contextOn('document.insert'), { args: {}, documents: text });
  await keep('insertOne', await sendStep(engines, inserted('{ name: "Grace" }')));
  await keep('insertMany', await sendStep(engines, inserted('[ { a: 1 }, { a: 2 } ]')));
  const saved = save.plan(contextOn('document.save'), {
    args: { id: int(2), text: '{ _id: 2, status: "paid" }', original: { _id: int(2), status: 'new' } },
    current: { _id: int(2), status: 'new' },
  });
  await keep('replaceOne', await sendStep(engines, saved));
  const updated = updateMany.plan(contextOn('document.update-many'), {
    args: { filter: '{ status: "new" }' },
    count: 2,
    update: '{ $set: { status: "archived" } }',
  });
  await keep('updateMany', await sendStep(engines, updated));
  const selected = deleteSelected.plan(contextOn('document.delete-selected'), {
    args: { ids: [int(2), int(3), int(404)] },
  });
  await keep('deleteMany-selected', await sendStep(engines, selected));
  const deleted = deleteOne.plan(contextOn('document.delete'), { args: { id: int(5) }, document: { _id: int(5) } });
  await keep('deleteOne', await sendStep(engines, deleted));
  await keep('deleteOne-none', await sendStep(engines, deleted));
}

describe('the recorded replies of the server', () => {
  it.runIf(recording)('records the reads and the writes of the document area on MongoDB', async () => {
    const engines = createEngines();
    await engines.connect(
      local.id,
      { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    try {
      await mkdir(folder, { recursive: true });
      await engines.send(
        {
          connection: local.id,
          request: { engine: 'mongodb', database, method: 'runCommand', arguments: [{ dropDatabase: int(1) }] },
        },
        AbortSignal.timeout(20_000),
      );
      await send(engines, 'insertMany', [[typed, ...others]]);
      await recordReads(engines);
      await recordEdits(engines);
      await recordWrites(engines);
    } finally {
      await engines.disconnectAll();
    }
    expect(recording).toBe(true);
  });
});
