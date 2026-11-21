import { describe, expect, it } from 'vitest';
import type { FedStep } from '../../../src/features/backup/types';
import { largestIdRead, parseCount, plan, sampleRead } from '../../../src/features/transfer/generate';
import { analyzeSample } from '../../../src/features/transfer/generate/sample';
import type { Answers, ReadRequest } from '../../../src/shared/feature';
import { connectionId } from '../../../src/shared/ids';
import { connection, contextOn, local, next, ordersOn, planOf, production, staging, stateWith } from './harness';

const int = (value: number) => ({ $numberInt: String(value) });
const sample = analyzeSample(
  Array.from({ length: 40 }, (_, index) => ({ _id: int(index + 1), status: index % 2 === 0 ? 'active' : 'pending' })),
);
const contents = { buckets: [], entries: [{ name: 'orders', kind: 'collection', system: false }] };
const here: Answers = { sample, 'how-many': '100', contents, where: 'this', seed: '42', 'largest-id': 40 };

function generating(answers: Answers, on = local, state = stateWith()) {
  return plan(contextOn(ordersOn(on), 'transfer.generate', state), answers);
}

describe('transfer.generate', () => {
  it('accepts a whole number from 1 to 1,000,000, with separators between digits', () => {
    expect(parseCount('0')).toBeUndefined();
    expect(parseCount('1000001')).toBeUndefined();
    expect(parseCount('12a')).toBeUndefined();
    expect(parseCount('1,000')).toBe(1000);
    expect(parseCount('10 000')).toBe(10000);
    expect(parseCount('1000000')).toBe(1_000_000);
  });

  it('samples the collection first, then asks how many, 100 proposed', () => {
    expect(generating({})).toEqual({
      kind: 'read',
      need: {
        key: 'sample',
        read: 'transfer.generate:sample',
        args: { connection: local.id, database: 'shop', collection: 'orders' },
      },
    });
    const asked = generating({ sample });
    expect(asked.kind === 'ask' && asked.question).toMatchObject({
      title: 'Generate documents like shop.orders: how many',
      text: 'Number of documents to generate (up to 1,000,000), like the 40 analyzed',
      fields: [{ key: 'how-many', default: '100' }],
    });
  });

  it('refuses when there is nothing to imitate', () => {
    expect(generating({ sample: { sampled: 0, fields: [] } })).toEqual({
      kind: 'refuse',
      code: 'transfer.generate/nothing-to-imitate',
      message: 'shop.orders has no documents to imitate.',
    });
    expect(generating({ args: { analysis: { sampled: 0, fields: [] }, filter: '{ a: 1 }' } })).toMatchObject({
      message: 'No documents match the filter: there is nothing to imitate.',
    });
  });

  it('offers this collection or another one when the source is writable', () => {
    expect(next(generating({ sample, 'how-many': '100' }))).toBe('read:contents');
    const asked = generating({ sample, 'how-many': '100', contents });
    expect(asked.kind === 'ask' && asked.question.fields[0]).toMatchObject({
      key: 'where',
      choices: [{ value: 'this' }, { value: 'another', description: 'new or existing, on any connection' }],
    });
  });

  it('asks the destination connection directly for a view or on a read-only connection', () => {
    expect(next(generating({ sample, 'how-many': '100' }, production))).toBe('destination-connection');
    const view = { buckets: [], entries: [{ name: 'orders', kind: 'view', system: false }] };
    expect(next(generating({ sample, 'how-many': '100', contents: view }))).toBe('destination-connection');
    expect(generating({ sample, 'how-many': '100', 'destination-connection': production.id }, production)).toEqual({
      kind: 'refuse',
      code: 'transfer.generate/read-only',
      message: 'The connection Production is read-only.',
    });
  });

  it('refuses a destination that is not connected, with its error', () => {
    const offline = stateWith(undefined, undefined, [staging]);
    const answers = { sample, 'how-many': '100', 'destination-connection': staging.id };
    expect(generating(answers, production, offline)).toEqual({
      kind: 'refuse',
      code: 'transfer.generate/not-connected',
      message: 'Could not connect to Staging: not connected',
    });
  });

  it('asks the seed, then the largest numeric _id of the destination when the _ids count up', () => {
    expect(next(generating({ ...here, seed: undefined }))).toBe('seed');
    expect(generating({ ...here, 'largest-id': undefined })).toEqual({
      kind: 'read',
      need: {
        key: 'largest-id',
        read: 'transfer.generate:largest-id',
        args: { connection: local.id, database: 'shop', collection: 'orders' },
      },
    });
  });

  it('inserts from a generated feed, and shows three examples, the first inserted', () => {
    const generated = planOf(generating(here));
    const step = generated.steps[0] as FedStep;
    expect(generated.steps).toHaveLength(1);
    expect(step.feed).toMatchObject({
      kind: 'generated',
      count: 100,
      options: { seed: '42', now: 1_793_000_000_000, nextId: 41 },
    });
    expect(step.request).toMatchObject({ method: 'insertMany', collection: 'orders' });
    const lines = generated.danger.kind === 'confirm' ? generated.danger.text.split('\n') : [];
    expect(lines.slice(0, 2)).toEqual([
      'Insert 100 generated documents into shop.orders?',
      'They look like the 40 documents analyzed in Local › shop.orders, seed 42. For example:',
    ]);
    expect(lines.slice(2)).toHaveLength(3);
    expect(lines[2]).toContain('_id: 41');
    expect(generated.publishes).toBe(false);
    expect(generated.title).toBe('Generate 100 documents like shop.orders');
    expect(generated.undo).toMatchObject({ keeps: { kind: 'inserted', collection: 'orders' } });
  });

  it('shows as many examples as documents when fewer than three', () => {
    const generated = planOf(generating({ ...here, 'how-many': '2' }));
    expect(generated.danger.kind === 'confirm' && generated.danger.text.split('\n').slice(2)).toHaveLength(2);
  });

  it('uses the seed the runner drew when none is typed', () => {
    const step = planOf(generating({ ...here, seed: '', drawnSeed: 'abc' })).steps[0] as FedStep;
    expect(step.feed).toMatchObject({ options: { seed: 'abc' } });
    const timed = planOf(generating({ ...here, seed: '' })).steps[0] as FedStep;
    expect(timed.feed).toMatchObject({ options: { seed: '1793000000000' } });
  });

  it('says the inserts are not published to Redis when the connection publishes', () => {
    const publishing = connection('c-local', 'Local', { publishesTo: connectionId('c-redis') });
    const generated = planOf(generating(here, publishing, stateWith([publishing])));
    expect(generated.danger.kind === 'confirm' && generated.danger.text).toContain(
      'Like Import, the inserts are not published to Redis for redis-oplog.',
    );
  });

  it('says 20,000 documents cannot be undone', () => {
    expect(planOf(generating({ ...here, 'how-many': '20,000' })).undo).toEqual({
      cannot: "This can't be undone: the undo history keeps operations of up to 10,000 documents.",
    });
  });

  it('reads a sample of 1,000 with $sample, and the largest numeric _id', () => {
    const args = { connection: local.id, database: 'shop', collection: 'orders' };
    const sampled = sampleRead.request(contextOn(ordersOn(), 'x'), args) as ReadRequest;
    expect(sampled.kind === 'engine' && sampled.requests[0]?.request).toMatchObject({
      method: 'aggregate',
      arguments: [[{ $sample: { size: { $numberInt: '1000' } } }], { allowDiskUse: true }],
    });
    expect(sampleRead.parse([[{ a: 'x' }, { a: 'y' }]], args)).toMatchObject({ sampled: 2 });
    expect(() => sampleRead.parse([new Error('boom')], args)).toThrow(/^Could not analyze shop\.orders/u);
    expect(largestIdRead.parse([[{ _id: int(41) }]], args)).toBe(41);
    expect(largestIdRead.parse([[]], args)).toBeNull();
  });
});
