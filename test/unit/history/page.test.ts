import { describe, expect, it } from 'vitest';
import { plan as copyVersion } from '../../../src/features/history/copy-version';
import { ownWrites } from '../../../src/features/history/own-writes';
import {
  lastOpened,
  plan as showPlan,
  view as showView,
  type HistoryPageInput,
} from '../../../src/features/history/show';
import type { DocumentWrite } from '../../../src/features/history/types';
import { view as detailView, type VersionDetailInput } from '../../../src/features/history/version-detail';
import { documentHistory } from '../../../src/features/history/versions';
import type { Json } from '../../../src/shared/engine-request';
import type { Outcome, Plan } from '../../../src/shared/feature';
import { tabId } from '../../../src/shared/ids';
import { contextOf } from '../connection/context';
import { local, mongoState, recordedId, recordedWrites } from './recorded';

function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

const int = (value: number): Json => ({ $numberInt: String(value) });
const oplog = { first: { t: 1000, i: 1, time: 1_000_000 }, last: { t: 12_520, i: 1, time: 12_520_000 } };

/** The writes of a document inserted and updated twice, the last of them in a transaction. */
function threeWrites(): readonly DocumentWrite[] {
  const id = { _id: int(7) };
  return [
    { t: 10, i: 1, position: -1, wall: 10_000, op: 'i', o: { _id: int(7), status: 'new', note: 'gift' } },
    {
      t: 20,
      i: 1,
      position: -1,
      wall: 20_000,
      op: 'u',
      o: { $v: int(2), diff: { u: { status: 'paid' }, d: { note: false } } },
      o2: id,
    },
    {
      t: 30,
      i: 1,
      position: 0,
      wall: 30_000,
      op: 'u',
      o: { $v: int(2), diff: { u: { status: 'shipped' } } },
      o2: id,
      group: 'transaction',
      session: 'UUID("6a")',
      transactionNumber: 'NumberLong(4)',
    },
  ];
}

/** Fields that may be given as undefined, to leave them out. */
type Given<T> = { readonly [K in keyof T]?: T[K] | undefined };

/** The fields with those given, without those given as undefined. */
function withGiven<T extends object>(base: T, given: Given<T>): T {
  const merged: Record<string, unknown> = { ...base, ...given };
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined)) as T;
}

function pageInput(given: Given<HistoryPageInput> = {}): HistoryPageInput {
  const history = documentHistory(threeWrites(), { _id: int(7), status: 'shipped' });
  const base: HistoryPageInput = {
    connectionName: 'Local',
    readOnly: false,
    database: 'shop',
    collection: 'orders',
    idText: '7',
    offsetMinutes: 0,
    status: { kind: 'loaded' },
    oplog,
    read: { stop: { readBackTo: { t: 1000, i: 0 }, complete: true, timedOut: false }, writes: 3, durationMs: 420 },
    history,
    exists: true,
    own: {},
  };
  return withGiven(base, given);
}

describe('history.show', () => {
  it('lists three writes newest first, the newest current and selected', () => {
    const page = showView(pageInput());
    expect(page.body.kind).toBe('list');
    const rows = page.body.kind === 'list' ? page.body.rows : [];
    expect(rows.map((row) => row.write)).toEqual(['Update', 'Update', 'Insert']);
    expect(rows[0]?.version).toEqual({ text: 'current', tooltip: 'The document as it is now' });
    expect(rows[0]?.selected).toBe(true);
    expect(page.selected).toBe(rows[0]?.key);
    expect(rows[1]?.changes).toBe('set status · unset note');
    expect(rows[2]?.changes).toBe('inserted a document of 3 fields');
    expect(page.toolbar).toMatchObject({ place: 'shop.orders', id: '_id: 7' });
    expect(page.oplogLine).toMatch(
      /^The oplog goes back to 1970-01-01 00:16:40 \(3\.2 h\): older writes are no longer there\. 3 writes found in 0\.4 s\.$/u,
    );
  });

  it('says transaction under by, with its session in the tooltip', () => {
    const page = showView(pageInput());
    const rows = page.body.kind === 'list' ? page.body.rows : [];
    expect(rows[0]?.by).toEqual([{ text: 'transaction', tooltip: 'session UUID("6a") · txnNumber NumberLong(4)' }]);
  });

  it('says Datardo under by, with the title the write has in the undo history', () => {
    const input = pageInput();
    const versions = input.history?.versions ?? [];
    const own = ownWrites(versions, [{ title: 'Edit status of 7', time: 20_500, did: 'updated' }]);
    const page = showView({ ...input, own: Object.fromEntries(own) });
    const rows = page.body.kind === 'list' ? page.body.rows : [];
    expect(rows[1]?.by[0]).toEqual({
      text: 'Datardo',
      tooltip: 'Written from Datardo: Edit status of 7 (in the Undo history)',
    });
  });

  it('shows the message of a standalone server and no list', () => {
    const message =
      'A standalone server has no oplog, so there is no history of the writes: it needs a replica set. A single-node one is enough (mongod --replSet rs0, then rs.initiate()).';
    const page = showView(pageInput({ status: { kind: 'no-oplog', message }, history: undefined, read: undefined }));
    expect(page.body).toEqual({ kind: 'message', text: message });
    expect(page.oplogLine).toBeUndefined();
  });

  it('marks the versions before the replacement and says older versions are gone, when the insert is gone', () => {
    const writes = recordedWrites().filter((each) => each.op !== 'i' && each.op !== 'd');
    const history = documentHistory(writes, { _id: recordedId, status: 'shipped', qty: { $numberDouble: '1.0' } });
    const page = showView(pageInput({ history, idText: 'ObjectId("65f1c0de9a7b4e00012f3a2c")' }));
    const rows = page.body.kind === 'list' ? page.body.rows : [];
    expect(rows.slice(-3).every((row) => row.version?.text === 'partial' || row.version?.text === 'unknown')).toBe(
      true,
    );
    expect(page.endNote).toBe('Older versions are no longer in the oplog.');
  });

  it('says when no write is left in the oplog, or in the part read', () => {
    const empty = showView(pageInput({ history: documentHistory([], { _id: int(7) }) }));
    expect(empty.body).toEqual({
      kind: 'empty',
      text: 'No write to this document is left in the oplog: it was last written before 1970-01-01 00:16:40.',
    });
    const part = showView(
      pageInput({
        history: documentHistory([], { _id: int(7) }),
        read: { stop: { readBackTo: { t: 5000, i: 0 }, complete: false, timedOut: false }, writes: 0, durationMs: 100 },
      }),
    );
    expect(part.body).toEqual({
      kind: 'empty',
      text: 'No write to this document in the part of the oplog read: Load older reads further back.',
    });
  });

  it('after a read that stopped at 100 writes, says where it stopped and offers Load older', () => {
    const page = showView(
      pageInput({
        read: { stop: { readBackTo: { t: 15, i: 0 }, complete: false, timedOut: false }, writes: 100, durationMs: 900 },
      }),
    );
    expect(page.more?.text).toBe(
      'The oplog was read back to 1970-01-01 00:00:15. Older writes of this document may be in the rest.',
    );
    expect(page.more?.loadOlder).toMatchObject({
      label: 'Load older',
      element: 'history.read-writes@list',
      args: { readBackTo: { t: 15, i: 0 } },
    });
    const timedOut = showView(
      pageInput({
        read: { stop: { readBackTo: { t: 15, i: 0 }, complete: false, timedOut: true }, writes: 10, durationMs: 8000 },
      }),
    );
    expect(timedOut.more?.text).toMatch(/^Reading stopped at the time limit: the oplog was read back to /u);
  });

  it('disables Refresh, Load older and the restore buttons while loading, and restoring on a read-only connection', () => {
    const loading = showView(pageInput({ status: { kind: 'loading', older: true } }));
    expect(loading.toolbar.refresh.disabled).toBe(true);
    expect(loading.loadingOlder).toBe('Reading older entries of the oplog…');
    const readOnly = showView(pageInput({ readOnly: true }));
    const rows = readOnly.body.kind === 'list' ? readOnly.body.rows : [];
    expect(rows[1]?.restore).toMatchObject({ disabled: true, tooltip: 'The connection Local is read-only.' });
    expect(rows[0]?.restore).toBeUndefined();
    const first = showView(pageInput({ status: { kind: 'loading', older: false } }));
    expect(first.body).toEqual({ kind: 'loading', text: 'Reading the oplog…' });
  });

  it('offers Insert again… when the document no longer exists', () => {
    const history = documentHistory(
      [...threeWrites(), { t: 40, i: 1, position: -1, op: 'd', o: { _id: int(7) } }],
      undefined,
    );
    const page = showView(pageInput({ history, exists: false }));
    const rows = page.body.kind === 'list' ? page.body.rows : [];
    expect(rows[0]?.version?.text).toBe('no document');
    expect(rows[1]?.restore?.label).toBe('Insert again…');
  });

  it('opens one tab for the document, and refuses Go to with no document', () => {
    const state = mongoState();
    const target = { kind: 'collection', connection: local.id, database: 'shop', collection: 'orders' } as const;
    const context = contextOf('history.show', state, target);
    const opened = planOf(showPlan(context, { args: { id: int(7), idText: '7' } }));
    const shows = {
      kind: 'page',
      connection: local.id,
      page: 'history',
      title: 'History: 7',
      database: 'shop',
      of: ['orders', '{"$numberInt":"7"}'],
    };
    expect(opened.after).toEqual([
      { kind: 'remember', key: 'history.show', value: { shows, at: context.now } },
      { kind: 'start', feature: 'tab.open', target, args: { shows } },
    ]);
    expect(lastOpened(opened.after[0]?.kind === 'remember' ? opened.after[0].value : null)).toEqual({
      shows,
      at: context.now,
    });
    expect(showPlan(contextOf('history.show', state, { kind: 'tab', tab: tabId('t1') }), {})).toEqual({
      kind: 'refuse',
      code: 'history.show/no-document',
      message: 'Open a document of a collection first: a new document has no history yet.',
    });
  });
});

describe('history.version-detail', () => {
  function detailInput(given: Given<VersionDetailInput> = {}): VersionDetailInput {
    const history = documentHistory(threeWrites(), { _id: int(7), status: 'shipped' });
    const base: VersionDetailInput = {
      pageReady: true,
      current: false,
      exists: true,
      loading: false,
      offsetMinutes: 60,
      ...(history.versions[1] === undefined ? {} : { version: history.versions[1] }),
    };
    return withGiven(base, given);
  }

  it('shows the time, the buttons, the difference and the document after the write', () => {
    const detail = detailView(detailInput());
    expect(detail.kind).toBe('version');
    if (detail.kind !== 'version') {
      return;
    }
    expect(detail.heading).toBe('1970-01-01 01:00:20 · Timestamp({ t: 20, i: 1 })');
    expect(detail.buttons.map((button) => button.element)).toEqual([
      'document.restore-version@inspector',
      'history.copy-version@inspector',
    ]);
    expect(detail.table?.lines.map((line) => [line.field, line.kind])).toEqual([
      ['status', 'changed'],
      ['note', 'removed'],
    ]);
    expect(detail.document?.open).toBe(false);
  });

  it('shows ? for an unknown value and says why, and no Copy for a partial version', () => {
    const writes = threeWrites().slice(1);
    const history = documentHistory(writes, { _id: int(7), status: 'shipped' });
    const detail = detailView(detailInput({ version: history.versions[0] }));
    if (detail.kind !== 'version') {
      throw new Error('Expected a version.');
    }
    expect(detail.buttons).toEqual([]);
    expect(detail.notes[0]).toMatch(/^Partial: the values marked \? aren't known/u);
    expect(detail.document?.segments.some((segment) => segment.kind === 'unknown')).toBe(true);
  });

  it('says nothing selected, and nothing while the page loads', () => {
    expect(detailView(detailInput({ version: undefined }))).toEqual({
      kind: 'nothing-selected',
      text: 'Select a write to see what it changed.',
    });
    expect(detailView(detailInput({ pageReady: false }))).toEqual({ kind: 'empty' });
  });

  it('says no field changed for an update that changed nothing', () => {
    const writes: DocumentWrite[] = [
      ...threeWrites(),
      { t: 40, i: 1, position: -1, op: 'u', o: { $v: int(2), diff: {} }, o2: { _id: int(7) } },
    ];
    const history = documentHistory(writes, { _id: int(7), status: 'shipped' });
    const detail = detailView(detailInput({ version: history.versions[3], current: true }));
    expect(detail).toMatchObject({ noChange: 'No field changed.', document: { open: true } });
  });
});

describe('history.copy-version', () => {
  it('copies an exact version in mongosh syntax and says so', () => {
    const document = { _id: { $oid: '65f1c0de9a7b4e00012f3a2c' }, total: { $numberLong: '250' } };
    const copied = planOf(
      copyVersion(contextOf('history.copy-version', mongoState()), { args: { document, state: 'exact' } }),
    );
    expect(copied.steps).toEqual([]);
    expect(copied.after).toEqual([
      { kind: 'copy', text: '{ _id: ObjectId("65f1c0de9a7b4e00012f3a2c"), total: NumberLong(250) }' },
      { kind: 'notify', level: 'success', text: 'Copied to the clipboard' },
    ]);
  });

  it('copies nothing of a partial version', () => {
    const partial = planOf(
      copyVersion(contextOf('history.copy-version', mongoState()), { args: { document: {}, state: 'partial' } }),
    );
    expect(partial.after).toEqual([]);
  });
});
