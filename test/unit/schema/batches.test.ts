/**
 * The analysis a batch at a time, on a worker thread and in the main process (`src/runner/workers`), and the tab's
 * sample in the app's state (`src/shared/state/schema.ts`), which the Schema section shows however it was started.
 */
import { describe, expect, it } from 'vitest';
import { analysisBatch, schemaSummary } from '../../../src/features/schema/analyze';
import { Cancelled } from '../../../src/runner/cancel';
import { analyzeHere } from '../../../src/runner/workers/analysis';
import { analyzeInBatches, type AnalysisMessage } from '../../../src/runner/workers/analysis-thread';
import type { Json } from '../../../src/shared/engine-request';
import { tabId } from '../../../src/shared/ids';
import { initialSchemaState, reduceSchema, type SchemaState } from '../../../src/shared/state/schema';

const documents: readonly Json[] = Array.from({ length: analysisBatch * 2 + 10 }, (_, index) => ({
  n: { $numberInt: String(index) },
  even: index % 2 === 0,
}));

describe('schema.analyze', () => {
  it('gives a batch at a time on a worker what it gives at once, saying how far it is after each batch', () => {
    const said: AnalysisMessage[] = [];
    analyzeInBatches({ kind: 'schema.analyze', documents, cancelled: new Int32Array(1) }, (message) => {
      said.push(message);
    });
    expect(said.slice(0, -1)).toEqual([
      { kind: 'progress', done: analysisBatch },
      { kind: 'progress', done: analysisBatch * 2 },
      { kind: 'progress', done: analysisBatch * 2 + 10 },
    ]);
    expect(said.at(-1)).toEqual({ kind: 'done', summary: schemaSummary(documents) });
  });

  it('stops on a worker within one batch once the flag is raised', () => {
    const cancelled = new Int32Array(1);
    const said: AnalysisMessage[] = [];
    analyzeInBatches({ kind: 'schema.analyze', documents, cancelled }, (message) => {
      said.push(message);
      Atomics.store(cancelled, 0, 1);
    });
    expect(said).toEqual([{ kind: 'progress', done: analysisBatch }, { kind: 'cancelled' }]);
  });

  it('gives in the main process what it gives at once, and stops within one batch when cancelled', async () => {
    expect(await analyzeHere(documents, new AbortController().signal)).toEqual(schemaSummary(documents));
    const controller = new AbortController();
    const done: number[] = [];
    const stopped = analyzeHere(documents, controller.signal, (count) => {
      done.push(count);
      controller.abort();
    });
    await expect(stopped).rejects.toBeInstanceOf(Cancelled);
    expect(done).toEqual([analysisBatch]);
  });
});

describe('schema.sample', () => {
  const tab = tabId('t1');
  const other = tabId('t2');

  function started(state: SchemaState = initialSchemaState): SchemaState {
    return reduceSchema(state, { slice: 'schema', type: 'sample-started', tab });
  }

  it('keeps the result of the tab, and keeps it while a newer sample runs', () => {
    const first = started();
    const read = reduceSchema(first, {
      slice: 'schema',
      type: 'sample-ended',
      tab,
      number: 1,
      end: { kind: 'read', result: { outOf: 4 } },
    });
    expect(read.samples[tab]).toEqual({ number: 1, running: false, result: { outOf: 4 } });
    expect(started(read).samples[tab]).toEqual({ number: 2, running: true, result: { outOf: 4 } });
  });

  it('ignores the end of a sample that a newer one replaced', () => {
    const twice = started(started());
    const late = reduceSchema(twice, {
      slice: 'schema',
      type: 'sample-ended',
      tab,
      number: 1,
      end: { kind: 'cancelled' },
    });
    expect(late).toBe(twice);
  });

  it('says it was cancelled or failed, and a newer read forgets it', () => {
    const cancelled = reduceSchema(started(), {
      slice: 'schema',
      type: 'sample-ended',
      tab,
      number: 1,
      end: { kind: 'cancelled' },
    });
    expect(cancelled.samples[tab]).toEqual({ number: 1, running: false, ended: { kind: 'cancelled' } });
    const again = started(cancelled);
    const read = reduceSchema(again, {
      slice: 'schema',
      type: 'sample-ended',
      tab,
      number: 2,
      end: { kind: 'read', result: {} },
    });
    expect(read.samples[tab]?.ended).toBeUndefined();
  });

  it('numbers each filter set, and drops what it keeps for the tabs closed', () => {
    const set = reduceSchema(started(), { slice: 'schema', type: 'filter-set', tab: other, filter: '{ a: 1 }' });
    expect(set.filters[other]).toEqual({ number: 2, filter: '{ a: 1 }' });
    const kept = reduceSchema(set, { slice: 'schema', type: 'kept-for', tabs: [tab] });
    expect(Object.keys(kept.samples)).toEqual([tab]);
    expect(kept.filters).toEqual({});
  });
});
