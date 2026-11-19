/**
 * The cards that send a pipeline: the run of a page and its count, the run of a pipeline that writes, and the view
 * saved from a pipeline. The replies parsed are those recorded from MongoDB 8.2.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse, request, runRequests } from '../../../src/features/aggregate/run';
import { createViewRequest, plan as saveAsView } from '../../../src/features/aggregate/save-as-view';
import { errorMark } from '../../../src/features/aggregate/stage-marks';
import { pipelineSummary } from '../../../src/features/aggregate/to-text';
import { plan as writeOutput } from '../../../src/features/aggregate/write-output';
import type { PipelineEditor } from '../../../src/features/aggregate/types';
import { formattedValue } from '../../../src/features/aggregate/mongosh/format';
import { stepText } from '../../../src/features/runner/step-text';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import type { Answers, Outcome, ReadRequest } from '../../../src/shared/feature';
import { contextOn, editorAfter, editorOf, local, planOf, questionOf, withPipeline } from './context';
import { off, stage } from './stages';

const fixtures = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');

function recorded(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtures, `mongodb-8.2-aggregate-${name}.json`), 'utf8')) as unknown;
}

const paidByCustomer = [
  stage('$match', '{ status: "paid" }'),
  stage('$group', '{ _id: "$customer", total: { $sum: "$total" } }'),
];

function sent(
  editor: PipelineEditor,
  more: Readonly<Record<string, Json>> = {},
  readOnly = false,
): ReadRequest | Outcome {
  return request(contextOn('aggregate.run', readOnly), withPipeline(editor, more)['args'] as Json);
}

function requestsOf(outcome: ReadRequest | Outcome): readonly MongoRequest[] {
  if (outcome.kind !== 'engine') {
    throw new Error(`Expected requests, got ${JSON.stringify(outcome)}`);
  }
  return outcome.requests.map((each) => each.request as MongoRequest);
}

function shell(request: MongoRequest): string {
  const { target } = contextOn('aggregate.run');
  return stepText({ kind: 'engine', connection: local.id, request, writes: false }, target);
}

describe('aggregate.run', () => {
  it('sends the page and the count of the pipeline', () => {
    const [page, count] = requestsOf(sent(editorOf(paidByCustomer)));
    expect(shell(page!)).toBe(
      'db.orders.aggregate([{ $match: { status: "paid" } }, { $group: { _id: "$customer", total: { $sum: "$total" } } }, { $skip: 0 }, { $limit: 50 }], { allowDiskUse: true, maxTimeMS: 60000 })',
    );
    expect(shell(count!)).toBe(
      'db.orders.aggregate([{ $match: { status: "paid" } }, { $group: { _id: "$customer", total: { $sum: "$total" } } }, { $count: "n" }], { allowDiskUse: true, maxTimeMS: 10000 })',
    );
    expect(page?.limit).toBe(50);
    expect(page?.timeLimitMs).toBe(60000);
    expect(count?.timeLimitMs).toBe(10000);
  });

  it('sends the third page of 20 with $skip 40 and $limit 20', () => {
    const [page] = requestsOf(sent(editorOf(paidByCustomer), { page: 3, pageSize: 20 }));
    expect(page?.arguments[0]).toEqual(
      expect.arrayContaining([{ $skip: { $numberInt: '40' } }, { $limit: { $numberInt: '20' } }]),
    );
  });

  it('sends the documents unchanged for a pipeline with no stages', () => {
    const [page] = requestsOf(sent(editorOf([])));
    expect(page?.arguments[0]).toEqual([{ $skip: { $numberInt: '0' } }, { $limit: { $numberInt: '50' } }]);
  });

  it('parses a page and its count recorded from MongoDB 8.2', () => {
    const output = parse([recorded('page'), recorded('count')]);
    expect(output.count).toBe(3);
    expect(output.documents).toHaveLength(3);
    expect(output.documents[0]).toMatchObject({ quantity: { $numberLong: '2' }, total: { $numberDouble: '20.5' } });
  });

  it('parses an empty count as 0 and a failed count as unknown', () => {
    expect(parse([[], recorded('count-empty')])).toEqual({ documents: [], count: 0 });
    expect(parse([[], undefined])).toEqual({ documents: [] });
  });

  it('keeps a NumberLong of the output a NumberLong', () => {
    const [first] = parse([recorded('group'), recorded('count')]).documents;
    const quantity = (first as Record<string, Json>)['quantity'] as Json;
    expect(formattedValue(quantity, { kind: 'one-line' })).toBe('NumberLong(9)');
  });

  it('runs the whole pipeline first when Run is pressed while a stage is shown', () => {
    const outcome = sent(editorOf(paidByCustomer, 0), { whole: true });
    const plan = planOf(outcome);
    expect(editorAfter(plan).shown).toBeUndefined();
    expect(plan.after[0]).toMatchObject({ kind: 'start', feature: 'aggregate.run' });
  });

  it('keeps the stage shown for Ctrl+Enter in a body', () => {
    const [page] = requestsOf(sent(editorOf(paidByCustomer, 0)));
    expect(page?.arguments[0]).toHaveLength(3);
  });

  it('sends nothing for a stage that does not parse, and marks it', () => {
    const broken = editorOf([stage('$match', '{}'), stage('$group', '{ _id: ')]);
    expect(sent(broken)).toEqual({
      kind: 'refuse',
      code: 'aggregate.run/invalid-stage',
      message: 'Stage 2 ($group): JSON5: invalid end of input at 1:8',
    });
    expect(errorMark(broken, {})).toEqual({
      stage: 1,
      message: 'Stage 2 ($group): JSON5: invalid end of input at 1:8',
    });
  });

  it('runs on a read-only connection', () => {
    expect(requestsOf(sent(editorOf(paidByCustomer), {}, true))).toHaveLength(2);
  });

  it('starts aggregate.write-output for a pipeline that ends with $out', () => {
    const plan = planOf(sent(editorOf([stage('$match', '{}'), stage('$out', '"x"')])));
    expect(plan.steps).toEqual([]);
    expect(plan.after[0]).toMatchObject({ kind: 'start', feature: 'aggregate.write-output' });
  });

  it('names a pipeline by its stages', () => {
    expect(pipelineSummary(paidByCustomer)).toBe('$match → $group');
  });

  it('builds the requests of a page from a pipeline', () => {
    const place = {
      connection: 'c' as never,
      connectionName: 'L',
      readOnly: false,
      database: 'shop',
      collection: 'orders',
      view: false,
    };
    expect(runRequests(place, [], 2, 10)[0]?.arguments[0]).toEqual([
      { $skip: { $numberInt: '10' } },
      { $limit: { $numberInt: '10' } },
    ]);
  });
});

const paidOut = (target: string): PipelineEditor =>
  editorOf([stage('$match', '{ status: "paid" }'), stage('$out', target)]);

function names(...collections: string[]): Answers['names'] {
  return {
    names: collections.map((name) => ({
      database: name.includes('.') ? name.split('.')[0] : 'shop',
      name: name.split('.').at(-1),
      kind: 'collection',
    })),
  };
}

function written(editor: PipelineEditor, existing?: Answers['names'], readOnly = false): Outcome {
  const answers = withPipeline(editor);
  return writeOutput(
    contextOn('aggregate.write-output', readOnly),
    existing === undefined ? answers : { ...answers, names: existing },
  );
}

describe('aggregate.write-output', () => {
  it('reads the names of the database before a $out', () => {
    expect(written(paidOut('"paid_orders"'))).toEqual({
      kind: 'read',
      need: { key: 'names', read: 'palette.find-collections', args: { connection: 'c-local', databases: ['shop'] } },
    });
  });

  it('confirms a $out to a new collection without a field to type', () => {
    const plan = planOf(written(paidOut('"paid_orders"'), names('orders')));
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: 'Run this pipeline? Its $out stage writes to "paid_orders".\nThis modifies the database. Select an earlier stage to preview without writing.',
      button: 'Run',
    });
    expect(plan.steps[0]?.text).toBe(
      'db.orders.aggregate([{ $match: { status: "paid" } }, { $out: "paid_orders" }], { allowDiskUse: true, maxTimeMS: 600000 })',
    );
    expect(plan.undo).toHaveProperty('cannot');
    expect(plan.publishes).toBe(false);
  });

  it('asks to type the name of a collection a $out replaces', () => {
    const plan = planOf(written(paidOut('"archive"'), names('orders', 'archive')));
    expect(plan.danger).toMatchObject({ kind: 'destructive', name: 'archive', button: 'Run' });
    expect((plan.danger as { text: string }).text).toContain(
      'It replaces the collection archive: the documents it holds now are lost.',
    );
  });

  it('asks to type db.coll for a $out to another database, and the collection itself', () => {
    const other = paidOut('{ db: "reports", coll: "archive" }');
    expect(planOf(written(other, names('reports.archive'))).danger).toMatchObject({
      kind: 'destructive',
      name: 'reports.archive',
    });
    expect(planOf(written(other, names('orders'))).danger).toMatchObject({ kind: 'confirm' });
    expect(planOf(written(paidOut('"orders"'), names('orders'))).danger).toMatchObject({
      kind: 'destructive',
      name: 'orders',
    });
  });

  it('asks no name for a $merge', () => {
    const merge = editorOf([stage('$merge', '{ into: "archive", whenMatched: "replace" }')]);
    expect(planOf(written(merge)).danger).toMatchObject({ kind: 'confirm' });
  });

  it('refuses on a read-only connection without reading the names', () => {
    expect(written(paidOut('"paid_orders"'), undefined, true)).toEqual({
      kind: 'refuse',
      code: 'aggregate.write-output/read-only',
      message: 'The connection Production is read-only. Pipelines ending with $out write to the database.',
    });
  });

  it('writes nothing while stage 1 is shown or the $out is disabled', () => {
    const shown = planOf(written({ ...paidOut('"x"'), shown: 0 }));
    expect(shown.steps).toEqual([]);
    expect(shown.after[0]).toMatchObject({ kind: 'start', feature: 'aggregate.run' });
    const disabled = planOf(written(editorOf([stage('$match', '{}'), off('$out', '"x"')])));
    expect(disabled.steps).toEqual([]);
  });

  it('refuses a $out that is not last', () => {
    const outcome = written(editorOf([stage('$out', '"copy"'), stage('$limit', '5')]));
    expect(outcome).toMatchObject({ kind: 'refuse', code: 'aggregate.write-output/invalid-stage' });
    expect((outcome as { message: string }).message).toContain('$out must be the last stage of the pipeline');
  });
});

describe('aggregate.save-as-view', () => {
  const sorted = editorOf([stage('$match', '{ status: "paid" }'), stage('$sort', '{ createdAt: -1 }')]);

  function saved(editor: PipelineEditor, more: Partial<Answers> = {}, readOnly = false): Outcome {
    return saveAsView(contextOn('aggregate.save-as-view', readOnly), { ...withPipeline(editor), ...more });
  }

  it('asks the name, then creates the view of the pipeline', () => {
    expect(saved(sorted)).toMatchObject({ kind: 'read', need: { key: 'names', read: 'palette.find-collections' } });
    const asked = saved(sorted, { names: names('orders') });
    expect(asked).toMatchObject({ kind: 'ask' });
    const plan = planOf(saved(sorted, { names: names('orders'), name: 'paid_orders' }));
    expect(plan.steps[0]?.text).toBe(
      'db.createView("paid_orders", "orders", [{ $match: { status: "paid" } }, { $sort: { createdAt: -1 } }])',
    );
    expect(plan.after).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'refresh' })]));
  });

  it('says how many stages the view holds', () => {
    const question = questionOf(saved(sorted, { names: names() }));
    expect(question.fields[0]?.label).toBe('Name of the view on orders (2 stages)');
    const one = questionOf(saved(editorOf([stage('$limit', '1')]), { names: names() }));
    expect(one.fields[0]?.label).toBe('Name of the view on orders (1 stage)');
  });

  it('does not take the name of a collection that exists', () => {
    const question = questionOf(saved(sorted, { names: names('orders', 'archive') }));
    const [field] = question.fields;
    expect(field?.kind === 'text' ? field.rules : []).toContainEqual({
      kind: 'not-one-of',
      values: ['orders', 'archive'],
      message: 'A collection or view with this name already exists',
    });
  });

  it('holds the stages up to the one shown, without the disabled ones', () => {
    const editor = editorOf(
      [stage('$match', '{}'), off('$limit', '1'), stage('$sort', '{ a: 1 }'), stage('$skip', '1')],
      2,
    );
    const plan = planOf(saved(editor, { names: names(), name: 'v' }));
    expect(plan.steps[0]).toMatchObject({
      request: { arguments: ['v', 'orders', [{ $match: {} }, { $sort: { a: { $numberInt: '1' } } }]] },
    });
  });

  it('refuses a pipeline that writes, without asking the name', () => {
    expect(saved(paidOut('"x"'))).toEqual({
      kind: 'refuse',
      code: 'aggregate.save-as-view/writes',
      message: "A view can't contain $out: select an earlier stage.",
    });
  });

  it('refuses on a read-only connection', () => {
    expect(saved(sorted, {}, true)).toEqual({
      kind: 'refuse',
      code: 'aggregate.save-as-view/read-only',
      message: 'The connection Production is read-only.',
    });
  });

  it('offers Open view in its notification', () => {
    const plan = planOf(saved(sorted, { names: names(), name: 'paid_orders' }));
    const notify = plan.after.find((each) => each.kind === 'notify');
    expect(notify).toMatchObject({ actions: [{ label: 'Open view', feature: 'tab.open' }] });
  });

  it('creates a view with createView', () => {
    const place = {
      connection: 'c' as never,
      connectionName: 'L',
      readOnly: false,
      database: 'shop',
      collection: 'orders',
      view: false,
    };
    expect(createViewRequest(place, 'v', [])).toMatchObject({ method: 'createView', arguments: ['v', 'orders', []] });
  });
});
