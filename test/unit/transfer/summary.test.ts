import { describe, expect, it } from 'vitest';
import type { FedStepTotals, FedTotals } from '../../../src/features/backup/types';
import { fedSummary } from '../../../src/features/transfer/ends/summary';
import { fedStep } from '../../../src/features/transfer/types';
import { noDanger, type After, type Plan } from '../../../src/shared/feature';
import type { Target } from '../../../src/shared/target';
import { contextOn, local, ordersOn, staging } from './harness';

function planInto(connection = staging.id, collection = 'orders', total?: number): Plan {
  const on = { connection, database: 'shop', collection };
  const step = fedStep(
    on,
    {
      method: 'insertMany',
      options: { ordered: false },
      from: 'documents',
      feed: { kind: 'documents', documents: [] },
    },
    ordersOn(),
    { title: 'Working', ...(total === undefined ? {} : { total, unit: 'documents' }) },
  );
  return { title: 'Plan', steps: [step], danger: noDanger, undo: { cannot: '' }, publishes: false, after: [] };
}

function counted(more: Partial<FedStepTotals> = {}): FedStepTotals {
  return { database: 'shop', collection: 'orders', read: 100, inserted: 100, duplicates: 0, failed: 0, ...more };
}

function totals(more: Partial<FedTotals> = {}): FedTotals {
  return {
    milliseconds: 1500,
    steps: [counted()],
    indexes: { created: 0, failed: [] },
    ended: 'done',
    recorded: 1,
    ...more,
  };
}

function notice(afters: readonly After[] | undefined): Extract<After, { kind: 'notify' }> {
  const found = afters?.find((after) => after.kind === 'notify');
  if (found?.kind !== 'notify') {
    throw new Error('No notification.');
  }
  return found;
}

const on = (feature: string, target: Target = ordersOn()) => contextOn(target, feature);

describe('transfer.copy-collection', () => {
  it('ends with Copied … into the destination, the indexes created, and Open', () => {
    const done = notice(
      fedSummary(on('transfer.copy-collection'), planInto(), totals({ indexes: { created: 2, failed: [] } })),
    );
    expect(done.level).toBe('success');
    expect(done.text).toContain('Staging › shop.orders');
    expect(done.actions?.[0]).toMatchObject({ feature: 'tab.open', args: { shows: { kind: 'collection' } } });
  });

  it('warns of documents and indexes that failed, and of a copy too large for the undo history', () => {
    const failed = { index: 'at_1', on: 'orders', error: 'bad key' };
    const warned = notice(
      fedSummary(
        on('transfer.copy-collection'),
        planInto(),
        totals({
          steps: [counted({ inserted: 98, failed: 2, firstOtherError: 'too big', firstError: 'too big' })],
          indexes: { created: 0, failed: [failed] },
          notRecorded: 'too many documents',
        }),
      ),
    );
    expect(warned.level).toBe('warning');
    expect(warned.text).toContain('at_1: bad key');
    expect(warned.text).toContain('too big');
  });

  it('says how far a cancelled copy went, and reads the destination again', () => {
    const plan = planInto(staging.id, 'orders', 1000);
    const afters = fedSummary(
      on('transfer.copy-collection'),
      plan,
      totals({ ended: 'cancelled', steps: [counted({ read: 400, inserted: 400 })] }),
    );
    expect(afters?.[0]).toEqual({ kind: 'refresh', connection: staging.id });
    expect(notice(afters)).toMatchObject({ level: 'info' });
    expect(notice(afters).text).toMatch(/400/u);
    expect(notice(afters).text).toMatch(/1,000/u);
  });
});

describe('transfer.import', () => {
  it('says Imported <i> of <n> documents, a warning with the first error when some were refused', () => {
    const plan = planInto(local.id, 'orders', 100);
    const done = notice(fedSummary(on('transfer.import'), plan, totals()));
    expect(done.level).toBe('success');
    const warned = notice(
      fedSummary(
        on('transfer.import'),
        plan,
        totals({ steps: [counted({ inserted: 97, duplicates: 3, firstError: 'E11000 duplicate key' })] }),
      ),
    );
    expect(warned.level).toBe('warning');
    expect(warned.text).toContain('E11000 duplicate key');
  });

  it('says the error of an import that failed', () => {
    const failed = notice(
      fedSummary(on('transfer.import'), planInto(local.id), totals({ ended: 'failed', error: 'not primary' })),
    );
    expect(failed).toMatchObject({ level: 'error' });
    expect(failed.text).toContain('not primary');
  });
});

describe('transfer.generate', () => {
  it('names the collection alone when the documents go into the source, its connection otherwise', () => {
    const here = notice(fedSummary(on('transfer.generate'), planInto(local.id), totals()));
    expect(here.text).toContain('shop.orders');
    expect(here.text).not.toContain('›');
    const there = notice(fedSummary(on('transfer.generate'), planInto(staging.id), totals()));
    expect(there.text).toContain('Staging › shop.orders');
    expect(there.actions?.[0]).toMatchObject({ feature: 'tab.open' });
  });

  it('says how many were inserted before a failure', () => {
    const failed = notice(
      fedSummary(
        on('transfer.generate'),
        planInto(local.id),
        totals({ ended: 'failed', error: 'disk full', steps: [counted({ inserted: 300 })] }),
      ),
    );
    expect(failed.level).toBe('error');
    expect(failed.text).toContain('300');
    expect(failed.text).toContain('disk full');
  });
});

describe('backup.restore', () => {
  const shop: Target = { kind: 'database', connection: local.id, database: 'shop' };

  it('ends with the documents restored into the connection, and reads it again when cancelled', () => {
    const done = notice(fedSummary(on('backup.restore', shop), planInto(local.id), totals()));
    expect(done.level).toBe('success');
    expect(done.text).toContain('Local');
    const cancelled = fedSummary(on('backup.restore', shop), planInto(local.id), totals({ ended: 'cancelled' }));
    expect(cancelled?.[0]).toEqual({ kind: 'refresh', connection: local.id });
    expect(notice(cancelled).level).toBe('info');
  });

  it('warns of the documents skipped and failed, and says that each collection is undone apart', () => {
    const warned = notice(
      fedSummary(
        on('backup.restore', shop),
        planInto(local.id),
        totals({
          steps: [counted({ inserted: 90, duplicates: 5, failed: 5, firstOtherError: 'validation failed' })],
          recorded: 2,
        }),
      ),
    );
    expect(warned.level).toBe('warning');
    expect(warned.text).toContain('validation failed');
  });

  it('gives no message of its own for another feature', () => {
    expect(fedSummary(on('document.insert'), planInto(), totals())).toBeUndefined();
  });
});
