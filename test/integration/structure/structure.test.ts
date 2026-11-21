/**
 * The structure comparison of two databases against the test replica set (M35): both structures read through the
 * app action of the main process, their differences, the script copied and opened in a playground, an index applied
 * to the right database, and the read-only right side refused.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BothStructures } from '../../../src/features/structure/read';
import { diffStructure } from '../../../src/features/structure/steps';
import type { StructureComparison } from '../../../src/features/structure/types';
import type { Json } from '../../../src/shared/engine-request';
import type { Target } from '../../../src/shared/target';
import { liveCompare, localId, readOnlyId, type LiveCompare } from '../compare/live';

const leftDatabase = 'm35_structure_left';
const rightDatabase = 'm35_structure_right';
let live: LiveCompare;

function int(value: number): Json {
  return { $numberInt: String(value) };
}

const target: Target = { kind: 'connection', connection: localId };
const left = { connection: localId, database: leftDatabase };
const right = { connection: localId, database: rightDatabase };

async function seed(): Promise<void> {
  for (const database of [leftDatabase, rightDatabase]) {
    await live.send(database, undefined, 'runCommand', [{ dropDatabase: int(1) }]);
    await live.send(database, 'orders', 'insertOne', [{ _id: int(1), status: 'new' }, {}]);
  }
  await live.send(leftDatabase, 'orders', 'createIndex', [{ status: int(1) }, {}]);
  await live.send(leftDatabase, undefined, 'runCommand', [{ create: 'recent', viewOn: 'orders', pipeline: [] }]);
  await live.send(rightDatabase, 'legacy', 'insertOne', [{ _id: int(1) }, {}]);
  await live.send(leftDatabase, 'items', 'insertOne', [{ _id: int(1), sku: 'A' }, {}]);
  await live.send(leftDatabase, 'items', 'createIndex', [{ sku: int(1) }, { unique: true }]);
  await live.send(rightDatabase, 'items', 'insertMany', [
    [
      { _id: int(1), sku: 'A' },
      { _id: int(2), sku: 'A' },
    ],
    {},
  ]);
}

async function compared(): Promise<StructureComparison> {
  const result = await live.start('structure.read', target, { left, right });
  if (result.kind !== 'read') {
    throw new Error(`Expected a read, got ${JSON.stringify(result)}`);
  }
  const both = result.result as BothStructures;
  if (both.left.kind !== 'structure' || both.right.kind !== 'structure') {
    throw new Error(`Expected both structures, got ${JSON.stringify(both)}`);
  }
  return diffStructure(both.left.structure, both.right.structure);
}

function pageArgs(comparison: StructureComparison, more: Readonly<Record<string, Json>> = {}): Json {
  return {
    left,
    right,
    comparison: { left, right, differences: comparison.differences as unknown as Json },
    ...more,
  };
}

beforeAll(async () => {
  live = await liveCompare();
  await seed();
}, 120_000);

afterAll(async () => {
  for (const database of [leftDatabase, rightDatabase]) {
    await live.send(database, undefined, 'runCommand', [{ dropDatabase: int(1) }]);
  }
  await live.close();
});

describe('structure.read', () => {
  it('reads both databases at the same time and finds the index, the view and the collection that differ', async () => {
    const comparison = await compared();
    const summaries = comparison.differences.filter((each) => each.kind !== 'same').map((each) => each.summary);
    expect(summaries).toContain('Missing on the right: { status: 1 }');
    expect(summaries).toContain('View missing on the right (on orders)');
    expect(summaries).toContain('Collection only on the right');
  });
});

describe('structure.copy-script', () => {
  it('copies the script that makes the right database like the left one', async () => {
    const comparison = await compared();
    expect(await live.start('structure.copy-script', target, pageArgs(comparison))).toEqual({ kind: 'done' });
    const copied = live.recorded.at(-1);
    expect(copied?.action).toBe('nav.copy');
    expect(JSON.stringify(copied?.args)).toContain('createIndex({ status: 1 }');
  });
});

describe('structure.open-in-playground', () => {
  it('opens a new playground on the right database with the script', async () => {
    const comparison = await compared();
    expect(await live.start('structure.open-in-playground', target, pageArgs(comparison))).toEqual({ kind: 'done' });
    const opened = live.recorded.at(-1);
    expect(opened?.action).toBe('playground.open');
    expect(opened?.args).toMatchObject({ connection: localId, database: rightDatabase, caret: 'start' });
  });
});

describe('structure.apply', () => {
  it('creates the missing index on the right database, after which it is the same', async () => {
    const comparison = await compared();
    const index = comparison.differences.find((each) => each.summary === 'Missing on the right: { status: 1 }');
    const args = pageArgs(comparison, { chosen: [index?.id ?? ''] });
    expect(await live.start('structure.apply', target, args)).toEqual({ kind: 'done' });
    const again = await compared();
    const status = again.differences.find((each) => each.collection === 'orders' && each.name === 'status_1');
    expect(status?.kind).toBe('same');
  });

  it('applies the other differences when the step of one fails, and says which failed', async () => {
    const comparison = await compared();
    const unique = comparison.differences.find((each) => each.collection === 'items' && each.name === 'sku_1');
    const view = comparison.differences.find((each) => each.summary === 'View missing on the right (on orders)');
    const args = pageArgs(comparison, { chosen: [unique?.id ?? '', view?.id ?? ''] });
    expect(await live.start('structure.apply', target, args)).toEqual({ kind: 'done' });
    const [notice] = live.state().runner.notifications.slice(-1);
    expect(notice?.level).toBe('warning');
    expect(notice?.text).toContain('this step failed');
    expect(notice?.text).toContain('createIndexes: "items"');
    const again = await compared();
    expect(again.differences.find((each) => each.collection === 'recent')?.kind).toBe('same');
    expect(again.differences.find((each) => each.collection === 'items' && each.name === 'sku_1')?.kind).toBe(
      'only-left',
    );
  });

  it('refuses to change a right database on a read-only connection', async () => {
    const comparison = await compared();
    const readOnlyRight = { connection: readOnlyId, database: rightDatabase };
    const args = {
      left,
      right: readOnlyRight,
      comparison: { left, right: readOnlyRight, differences: comparison.differences as unknown as Json },
    };
    expect(await live.start('structure.apply', { kind: 'connection', connection: readOnlyId }, args)).toMatchObject({
      kind: 'refused',
      code: 'structure.apply/read-only',
    });
  });
});
