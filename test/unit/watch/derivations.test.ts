import { describe, expect, it } from 'vitest';
import { eventDiff } from '../../../src/features/watch/event-diff';
import { eventSummary } from '../../../src/features/watch/event-summary';
import { watchPipeline } from '../../../src/features/watch/pipeline';
import type { WatchEvent } from '../../../src/features/watch/types';
import { keepNewest, visibleEvents } from '../../../src/features/watch/visible-events';
import type { Json } from '../../../src/shared/engine-request';
import { recorded } from '../history/recorded';

const int = (value: number): Json => ({ $numberInt: String(value) });
const ns = { db: 'shop', coll: 'orders' };

function summary(change: Json, number = 1): WatchEvent {
  return eventSummary(change, number, 5000);
}

/** The change events recorded from a collection that records pre-images. */
function recordedEvents(): readonly WatchEvent[] {
  return (recorded('watch-change-events') as readonly Json[]).map((change, index) => summary(change, index + 1));
}

describe('watch.pipeline', () => {
  it('gives the pipeline of each row of the card', () => {
    expect(watchPipeline('')).toEqual({ ok: true, stages: [] });
    expect(watchPipeline('   ')).toEqual({ ok: true, stages: [] });
    expect(watchPipeline('{ "fullDocument.status": "active" }')).toEqual({
      ok: true,
      stages: [{ $match: { 'fullDocument.status': 'active' } }],
    });
    expect(watchPipeline('{ operationType: { $in: ["insert", "delete"] } }')).toEqual({
      ok: true,
      stages: [{ $match: { operationType: { $in: ['insert', 'delete'] } } }],
    });
    expect(watchPipeline('{ "documentKey._id": ObjectId("65f0c1a2b3c4d5e6f7a8b9c0") }')).toEqual({
      ok: true,
      stages: [{ $match: { 'documentKey._id': { $oid: '65f0c1a2b3c4d5e6f7a8b9c0' } } }],
    });
    expect(
      watchPipeline('[ { $match: { operationType: "update" } }, { $project: { "fullDocument.card": 0 } } ]'),
    ).toEqual({
      ok: true,
      stages: [{ $match: { operationType: 'update' } }, { $project: { 'fullDocument.card': int(0) } }],
    });
    expect(watchPipeline('[ { $group: { _id: "$operationType" } } ]')).toEqual({
      ok: false,
      message: "A change stream doesn't accept the stage $group.",
    });
    expect(watchPipeline('"active"')).toEqual({
      ok: false,
      message: 'The filter must be a document { … } or a list of stages [ … ].',
    });
    const invalid = watchPipeline('{ status: ');
    expect(invalid.ok).toBe(false);
    expect(invalid.ok ? '' : invalid.message).toMatch(/^Invalid filter: /u);
  });

  it('refuses a stage that is a document of two keys', () => {
    expect(watchPipeline('[ { $match: {}, $project: {} } ]')).toEqual({
      ok: false,
      message: "A change stream doesn't accept the stage $match, $project.",
    });
  });
});

describe('watch.event-summary', () => {
  it('gives the line of each row of the card', () => {
    const insert = summary({
      operationType: 'insert',
      ns,
      documentKey: { _id: int(7) },
      fullDocument: { _id: int(7), status: 'new' },
    });
    expect([insert.type, insert.id, insert.changes, insert.namespace]).toEqual([
      'insert',
      '7',
      '{ _id: 7, status: "new" }',
      'shop.orders',
    ]);
    const update = summary({
      operationType: 'update',
      ns,
      documentKey: { _id: int(7) },
      updateDescription: {
        updatedFields: { status: 'paid', 'items.1.qty': int(5) },
        removedFields: ['note'],
        truncatedArrays: [],
      },
    });
    expect(update.changes).toBe('set status, items.1.qty · unset note');
    const truncated = summary({
      operationType: 'update',
      ns,
      documentKey: { _id: int(7) },
      updateDescription: {
        updatedFields: {},
        removedFields: [],
        truncatedArrays: [{ field: 'tags', newSize: int(2) }],
      },
    });
    expect(truncated.changes).toBe('truncated tags');
    const replace = summary({
      operationType: 'replace',
      ns,
      documentKey: { _id: { $oid: '65f0c1a2b3c4d5e6f7a8b9c0' } },
      fullDocument: { a: int(1) },
    });
    expect([replace.id, replace.changes]).toEqual(['ObjectId("65f0c1a2b3c4d5e6f7a8b9c0")', '{ a: 1 }']);
    expect(summary({ operationType: 'delete', ns, documentKey: { _id: int(7) } }).changes).toBe('');
    const rename = summary({ operationType: 'rename', ns, to: { db: 'shop', coll: 'orders_old' } });
    expect([rename.id, rename.changes]).toEqual(['', '→ shop.orders_old']);
    expect(summary({ operationType: 'drop', ns }).changes).toBe('');
  });

  it('cuts a long document after 200 characters', () => {
    const insert = summary({
      operationType: 'insert',
      ns,
      documentKey: { _id: int(1) },
      fullDocument: { text: 'x'.repeat(5000) },
    });
    expect(insert.changes).toHaveLength(201);
    expect(insert.changes.endsWith('…')).toBe(true);
    expect(insert.after?.['text']).toHaveLength(5000);
  });

  it('takes the time from wallTime, then clusterTime, then the moment it was received', () => {
    expect(summary({ operationType: 'drop', wallTime: { $date: { $numberLong: '1700000000123' } } }).time).toBe(
      1_700_000_000_123,
    );
    expect(summary({ operationType: 'drop', clusterTime: { $timestamp: { t: 1_700_000_000, i: 3 } } }).time).toBe(
      1_700_000_000_000,
    );
    expect(summary({ operationType: 'drop' }).time).toBe(5000);
  });

  it('writes an _id that is a Long or a sub-document in mongosh syntax', () => {
    expect(summary({ operationType: 'delete', documentKey: { _id: { $numberLong: '9007199254740993' } } }).id).toBe(
      'NumberLong("9007199254740993")',
    );
    expect(summary({ operationType: 'delete', documentKey: { _id: { a: int(1) } } }).id).toBe('{ a: 1 }');
  });

  it('reads the recorded change events, with their documents before and after and their resume tokens', () => {
    const events = recordedEvents();
    expect(events.map((event) => event.type)).toEqual([
      'insert',
      'update',
      'replace',
      'delete',
      'rename',
      'invalidate',
    ]);
    expect(events[1]?.changes).toBe('set status, total · unset note');
    expect(events[1]?.before).toMatchObject({ status: 'new', note: 'gift' });
    expect(events[1]?.updated?.['total']).toEqual({ $numberLong: '5' });
    expect(events.every((event) => event.token !== undefined)).toBe(true);
    expect(events[4]?.changes).toBe('→ history-record.orders_old');
  });
});

describe('watch.visible-events', () => {
  const events = [
    summary(
      { operationType: 'insert', ns, documentKey: { _id: int(1) }, fullDocument: { _id: int(1), status: 'new' } },
      1,
    ),
    summary(
      { operationType: 'insert', ns, documentKey: { _id: int(2) }, fullDocument: { _id: int(2), status: 'new' } },
      2,
    ),
    summary(
      { operationType: 'insert', ns, documentKey: { _id: int(3) }, fullDocument: { _id: int(3), status: 'new' } },
      3,
    ),
    summary(
      {
        operationType: 'update',
        ns,
        documentKey: { _id: int(1) },
        updateDescription: { updatedFields: { status: 'paid' } },
      },
      4,
    ),
    summary(
      {
        operationType: 'update',
        ns,
        documentKey: { _id: int(2) },
        updateDescription: { updatedFields: { qty: int(2) } },
      },
      5,
    ),
    summary({ operationType: 'drop', ns }, 6),
  ];

  it('gives the lines and the count of each row of the card', () => {
    const all = visibleEvents(events, [], '');
    expect(all.shown.map((event) => event.number)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(all.count).toBe('6 change events');
    expect(all.counts).toEqual({ insert: 3, update: 2, replace: 0, delete: 0, other: 1 });
    const noUpdates = visibleEvents(events, ['update'], '');
    expect([noUpdates.shown.map((event) => event.number), noUpdates.count]).toEqual([
      [6, 3, 2, 1],
      '4 of 6 change events',
    ]);
    const onlyOther = visibleEvents(events, ['insert', 'update', 'delete', 'replace'], '');
    expect([onlyOther.shown.map((event) => event.type), onlyOther.count]).toEqual([['drop'], '1 of 6 change events']);
    expect(visibleEvents(events, [], 'PAID').shown.map((event) => event.number)).toEqual([4]);
    expect(visibleEvents(events, [], 'drop').count).toBe('1 of 6 change events');
  });

  it('keeps the newest 1,000 and counts those dropped', () => {
    const many = Array.from({ length: 1000 }, (_, index) => summary({ operationType: 'drop' }, index + 1));
    const added = Array.from({ length: 5 }, (_, index) => summary({ operationType: 'drop' }, 1001 + index));
    const kept = keepNewest(many, added);
    expect(kept.events).toHaveLength(1000);
    expect(kept.events[0]?.number).toBe(6);
    expect(kept.dropped).toBe(5);
  });

  it('finds a value that only the document after has, and counts hidden types', () => {
    const update = summary(
      {
        operationType: 'update',
        ns,
        documentKey: { _id: int(1) },
        updateDescription: { updatedFields: {} },
        fullDocument: { city: 'Rome' },
      },
      7,
    );
    expect(visibleEvents([update], [], 'rome').shown).toHaveLength(1);
    const hidden = visibleEvents([...events, update], ['update'], '');
    expect(hidden.counts.update).toBe(3);
    expect(visibleEvents(events, ['insert', 'update', 'replace', 'delete', 'other'], '').shown).toEqual([]);
  });
});

describe('watch.event-diff', () => {
  const update = (updatedFields: Json, before?: Json, removedFields: Json = [], truncatedArrays: Json = []) =>
    summary({
      operationType: 'update',
      documentKey: { _id: int(7) },
      updateDescription: { updatedFields, removedFields, truncatedArrays },
      ...(before === undefined ? {} : { fullDocumentBeforeChange: before }),
    });

  it('gives the rows of each row of the card', () => {
    expect(eventDiff(update({ status: 'paid' }))).toEqual([{ path: 'status', kind: 'changed', after: 'paid' }]);
    expect(eventDiff(update({ status: 'paid' }, { _id: int(7), status: 'new' }))).toEqual([
      { path: 'status', kind: 'changed', before: 'new', after: 'paid' },
    ]);
    expect(eventDiff(update({ note: 'gift' }, { _id: int(7) }))).toEqual([
      { path: 'note', kind: 'added', after: 'gift' },
    ]);
    expect(eventDiff(update({}, { _id: int(7), note: 'gift' }, ['note']))).toEqual([
      { path: 'note', kind: 'removed', before: 'gift' },
    ]);
    expect(eventDiff(update({ 'address.city': 'Rome' }, { _id: int(7), address: { city: 'Milan' } }))).toEqual([
      { path: 'address.city', kind: 'changed', before: 'Milan', after: 'Rome' },
    ]);
    expect(eventDiff(update({}, undefined, [], [{ field: 'tags', newSize: int(2) }]))).toEqual([
      { path: 'tags', kind: 'truncated', note: 'truncated to 2 elements' },
    ]);
    const replace = summary({
      operationType: 'replace',
      fullDocumentBeforeChange: { _id: int(7), a: int(1), b: { c: int(2) } },
      fullDocument: { _id: int(7), a: int(1), b: { c: int(3) }, d: [int(1)] },
    });
    expect(eventDiff(replace)).toEqual([
      { path: 'b.c', kind: 'changed', before: int(2), after: int(3) },
      { path: 'd', kind: 'added', after: [int(1)] },
    ]);
    expect(eventDiff(summary({ operationType: 'replace', fullDocument: { a: int(1) } }))).toEqual([]);
    expect(eventDiff(summary({ operationType: 'insert', fullDocument: { a: int(1) } }))).toEqual([]);
  });

  it('gives one row for an array, none for the same document, and a row for Int32 to Double', () => {
    const replace = (before: Json, after: Json) =>
      summary({ operationType: 'replace', fullDocumentBeforeChange: before, fullDocument: after });
    expect(eventDiff(replace({ tags: ['a', 'b'] }, { tags: ['a', 'c'] }))).toEqual([
      { path: 'tags', kind: 'changed', before: ['a', 'b'], after: ['a', 'c'] },
    ]);
    expect(eventDiff(replace({ a: int(1) }, { a: int(1) }))).toEqual([]);
    expect(eventDiff(update({ n: { $numberDouble: '1.0' } }, { n: int(1) }))).toEqual([
      { path: 'n', kind: 'changed', before: int(1), after: { $numberDouble: '1.0' } },
    ]);
    expect(eventDiff(update({ truncated: true }, undefined, [], [{ field: 'one', newSize: int(1) }]))[1]?.note).toBe(
      'truncated to 1 element',
    );
  });
});
