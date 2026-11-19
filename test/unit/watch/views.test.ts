import { describe, expect, it } from 'vitest';
import { eventSummary } from '../../../src/features/watch/event-summary';
import { view as detailView } from '../../../src/features/watch/event-detail';
import { reduceWatchPages } from '../../../src/features/watch/page/state';
import { plan as showPlan, view as showView, type WatchShowInput } from '../../../src/features/watch/show';
import type { WatchEvent } from '../../../src/features/watch/types';
import type { Json } from '../../../src/shared/engine-request';
import type { Outcome, Plan } from '../../../src/shared/feature';
import { contextOf } from '../connection/context';
import { local, mongoState, recorded } from '../history/recorded';
import { changeEvent, orders, pageOf, tab } from './page';

function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

const int = (value: number): Json => ({ $numberInt: String(value) });

function input(overrides: Partial<WatchShowInput> = {}): WatchShowInput {
  return {
    page: pageOf({ status: 'watching' }),
    connectionName: 'Local',
    readOnly: false,
    serverVersion: '8.2.5',
    offsetMinutes: 0,
    ...overrides,
  };
}

/** The recorded change event at an index: insert, update, replace, delete, rename, invalidate. */
function recordedEvent(index: number): WatchEvent {
  const change = (recorded('watch-change-events') as readonly Json[])[index];
  if (change === undefined) {
    throw new Error(`No recorded change event ${String(index)}.`);
  }
  return eventSummary(change, index + 1, 0);
}

describe('watch.show', () => {
  it('opens the tab Watch: orders, which says Watching and waits for changes', () => {
    const target = { kind: 'collection', connection: local.id, database: 'shop', collection: 'orders' } as const;
    const opened = planOf(showPlan(contextOf('watch.show', mongoState(), target), {}));
    expect(opened.after).toEqual([
      {
        kind: 'start',
        feature: 'tab.open',
        target: { kind: 'connection', connection: local.id },
        args: {
          shows: {
            kind: 'page',
            connection: local.id,
            page: 'watch',
            title: 'Watch: orders',
            database: 'shop',
            of: ['orders'],
          },
        },
      },
    ]);
    const notConnected = planOf(showPlan(contextOf('watch.show', mongoState('unknown'), target), {}));
    expect(notConnected.after[0]).toEqual({
      kind: 'start',
      feature: 'connection.connect',
      target: { kind: 'connection', connection: local.id },
    });
    const page = showView(input());
    expect(page.toolbar).toMatchObject({ watched: 'shop.orders', state: 'Watching' });
    expect(page.body).toEqual({
      kind: 'note',
      text: 'Waiting for changes… Insert, update or delete a document to see it here.',
    });
  });

  it('lists a new insert at the top with its _id and its document', () => {
    const page = showView(input({ page: pageOf({ status: 'watching', events: [changeEvent(1), changeEvent(2)] }) }));
    const rows = page.body.kind === 'list' ? page.body.rows : [];
    expect(rows[0]).toMatchObject({ number: 2, type: 'insert', id: '2', changes: '{ _id: 2, status: "new" }' });
    expect(rows[0]).not.toHaveProperty('collection');
    expect(page.body.kind === 'list' ? page.body.columns : []).toEqual(['time', 'type', '_id', 'changes']);
    expect(page.count).toBe('2 change events');
  });

  it('shows the collection column when a database is watched, and all databases for the deployment', () => {
    const database = { connection: local.id, database: 'shop' };
    const page = showView(input({ page: pageOf({ status: 'watching', events: [changeEvent(1)] }, database) }));
    expect(page.body.kind === 'list' ? page.body.rows[0]?.collection : undefined).toBe('shop.orders');
    expect(showView(input({ page: pageOf({}, { connection: local.id }) })).toolbar.watched).toBe('all databases');
    const deployment = planOf(
      showPlan(contextOf('watch.show', mongoState(), { kind: 'connection', connection: local.id }), {}),
    );
    expect(deployment.after.at(-1)).toMatchObject({ args: { shows: { title: 'Watch: Local', page: 'watch' } } });
  });

  it('says the message of a standalone server above an empty list', () => {
    const message =
      'Change streams need a replica set or a sharded cluster: this server is a standalone. (A single-node replica set is enough, e.g. mongod --replSet rs0 and rs.initiate().)';
    const page = showView(input({ page: pageOf({ status: 'error', message: { kind: 'standalone', text: message } }) }));
    expect(page.message).toBe(message);
    expect(page.body).toMatchObject({ kind: 'list', rows: [] });
  });

  it('says the stream was invalidated after a drop, with Start from the last change', () => {
    let pages = reduceWatchPages({}, { kind: 'opened', tab, watched: orders });
    pages = reduceWatchPages(pages, { kind: 'starting', tab });
    pages = reduceWatchPages(pages, {
      kind: 'received',
      tab,
      events: [changeEvent(1, 'drop'), changeEvent(2, 'invalidate')],
      invalidated: true,
    });
    const page = showView(input({ page: pages[tab] ?? pageOf() }));
    expect(page.message).toBe('The stream was invalidated: the collection or database was dropped or renamed.');
    expect(page.toolbar.state).toBe('Stopped');
    expect(page.toolbar.controls.map((control) => control.label)).toEqual([
      'Start',
      'Start from the last change',
      'Clear',
      'Export…',
    ]);
  });

  it('shows the states, the toggles, the count and the dropped', () => {
    expect(showView(input({ page: pageOf({ status: 'starting' }) })).body).toEqual({
      kind: 'note',
      text: 'Starting the change stream…',
    });
    expect(showView(input({ page: pageOf() })).body).toEqual({ kind: 'note', text: 'Not watching. Press Start.' });
    const hidden = showView(
      input({ page: pageOf({ status: 'watching', events: [changeEvent(1)], hiddenTypes: ['insert'], dropped: 5 }) }),
    );
    expect(hidden.body).toEqual({ kind: 'note', text: 'No change event matches the filters.' });
    expect(hidden.count).toBe('0 of 1 change event (5 older dropped)');
    expect(hidden.filters.types[0]).toMatchObject({
      label: 'insert',
      count: 1,
      on: false,
      tooltip: 'Show the insert events',
    });
    const paused = showView(input({ page: pageOf({ status: 'watching', paused: true, held: [changeEvent(1)] }) }));
    expect(paused.toolbar.state).toBe('Paused · 1 new');
    expect(paused.toolbar.controls[0]?.label).toBe('Resume (1)');
  });

  it('shows whether the collection records pre-images, with Enable… but not on a read-only connection', () => {
    const notRecorded = showView(input({ page: pageOf({ preImages: false }) }));
    expect(notRecorded.filters.preImages).toMatchObject({
      text: 'Values before a change: not recorded',
      enable: { label: 'Enable…' },
    });
    expect(
      showView(input({ page: pageOf({ preImages: false }), readOnly: true })).filters.preImages,
    ).not.toHaveProperty('enable');
    expect(showView(input({ page: pageOf({ preImages: true }) })).filters.preImages?.text).toBe('Pre-images recorded');
    expect(
      showView(input({ page: pageOf({ preImages: false }), serverVersion: '5.0.24' })).filters.preImages,
    ).toBeUndefined();
    const database = pageOf({ preImages: false }, { connection: local.id, database: 'shop' });
    expect(showView(input({ page: database })).filters.preImages).toBeUndefined();
  });

  it('opens nothing on a view: Go to on its tab watches its database', () => {
    const state = {
      ...mongoState(),
      tabs: {
        ...mongoState().tabs,
        tabs: [
          {
            id: tab,
            shows: { kind: 'collection', connection: local.id, database: 'shop', collection: 'big_orders', view: true },
            lastActive: 1,
            loaded: true,
          },
        ],
        active: tab,
      },
    } as unknown as ReturnType<typeof mongoState>;
    const opened = planOf(showPlan(contextOf('watch.show', state, { kind: 'app' }), {}));
    expect(opened.after.at(-1)).toMatchObject({ args: { shows: { title: 'Watch: shop', database: 'shop' } } });
  });
});

describe('watch.event-detail', () => {
  it('shows Changes with the value before on a collection that records pre-images', () => {
    const update = recordedEvent(1);
    const detail = detailView({ event: update, offsetMinutes: 0 });
    if (detail.kind !== 'event') {
      throw new Error('Expected a change event.');
    }
    expect(detail.sections.map((section) => [section.title, section.folded])).toEqual([
      ['Changes', false],
      ['Current document', true],
      ['Change event', true],
    ]);
    const table = detail.sections[0]?.content;
    expect(table?.kind === 'table' ? table.columns : []).toEqual(['field', 'before', 'after']);
    expect(table?.kind === 'table' ? table.lines.map((line) => line.field) : []).toEqual(['status', 'total', 'note']);
    expect(table?.kind === 'table' ? table.lines[2]?.cells : []).toEqual([
      { kind: 'value', value: 'gift', text: '"gift"' },
      { kind: 'note', text: '(removed)' },
    ]);
  });

  it('says the values before are not recorded, with the field and its new value', () => {
    const update = eventSummary(
      {
        operationType: 'update',
        ns: { db: 'shop', coll: 'orders' },
        documentKey: { _id: int(7) },
        updateDescription: { updatedFields: { status: 'paid' } },
      },
      1,
      0,
    );
    const detail = detailView({ event: update, offsetMinutes: 0 });
    const sections = detail.kind === 'event' ? detail.sections : [];
    expect(sections[0]).toMatchObject({
      title: 'Changes (the values before are not recorded)',
      content: {
        columns: ['field', 'value'],
        lines: [{ field: 'status', cells: [{ kind: 'value', text: '"paid"' }] }],
      },
    });
    expect(sections[1]).toEqual({
      title: 'Current document',
      folded: true,
      content: {
        kind: 'note',
        text: 'Current document (not read: enable "Current document on update", or the document was deleted)',
      },
    });
  });

  it('shows the deleted document, or says it was not recorded', () => {
    const recordedDelete = detailView({ event: recordedEvent(3), offsetMinutes: 0 });
    expect(recordedDelete.kind === 'event' ? recordedDelete.sections[0] : undefined).toMatchObject({
      title: 'Deleted document',
      content: { kind: 'document' },
    });
    const notRecorded = detailView({ event: changeEvent(5, 'delete'), offsetMinutes: 0 });
    expect(notRecorded.kind === 'event' ? notRecorded.sections[0]?.content : undefined).toEqual({
      kind: 'note',
      text: 'Not recorded: the collection does not store pre-images.',
    });
  });

  it('shows an insert with every type as stored, and Open document but not on a delete or a drop', () => {
    const insert = recordedEvent(0);
    const detail = detailView({ event: insert, offsetMinutes: 0 });
    if (detail.kind !== 'event') {
      throw new Error('Expected a change event.');
    }
    const inserted = detail.sections[0];
    expect(inserted?.title).toBe('Inserted document');
    expect(inserted?.content.kind === 'document' ? inserted.content.text : '').toContain(
      'ISODate("2026-11-18T00:00:00.000Z")',
    );
    expect(detail.buttons.map((button) => button.element)).toEqual([
      'document.open@inspector',
      'watch.copy-events@inspector',
    ]);
    const deleted = detailView({ event: recordedEvent(3), offsetMinutes: 0 });
    expect(deleted.kind === 'event' ? deleted.buttons.map((button) => button.label) : []).toEqual(['Copy event']);
    const drop = detailView({ event: changeEvent(9, 'drop', { documentKey: {} }), offsetMinutes: 0 });
    expect(drop.kind === 'event' ? drop.buttons.map((button) => button.label) : []).toEqual(['Copy event']);
  });

  it('shows the change event as received, last and folded, and nothing when nothing is selected', () => {
    const detail = detailView({ event: recordedEvent(0), offsetMinutes: 0 });
    const last = detail.kind === 'event' ? detail.sections.at(-1) : undefined;
    expect(last?.title).toBe('Change event');
    expect(last?.content.kind === 'document' ? Object.keys(last.content.value as object) : []).toEqual(
      expect.arrayContaining(['_id', 'clusterTime', 'documentKey']),
    );
    expect(detailView({ offsetMinutes: 0 })).toEqual({
      kind: 'nothing-selected',
      text: 'Select a change event to see what it changed.',
    });
  });

  it('says no field changed for a replacement with the same document', () => {
    const same = eventSummary(
      {
        operationType: 'replace',
        documentKey: { _id: int(1) },
        fullDocument: { a: int(1) },
        fullDocumentBeforeChange: { a: int(1) },
      },
      1,
      0,
    );
    const detail = detailView({ event: same, offsetMinutes: 0 });
    expect(detail.kind === 'event' ? detail.sections[0] : undefined).toEqual({
      title: 'Changes',
      folded: false,
      content: { kind: 'note', text: 'No field changed.' },
    });
  });
});
