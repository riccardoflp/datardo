import { describe, expect, it } from 'vitest';
import { plan as clear } from '../../../src/features/watch/clear';
import { plan as copyEvents } from '../../../src/features/watch/copy-events';
import { plan as enablePreImages, preImagesFailed } from '../../../src/features/watch/enable-pre-images';
import { exportFileName, plan as exportEvents } from '../../../src/features/watch/export';
import { reduceWatchPages, type WatchPages } from '../../../src/features/watch/page/state';
import { pauseLabel, plan as pause } from '../../../src/features/watch/pause';
import { plan as resume, resumeError } from '../../../src/features/watch/resume';
import { plan as stop } from '../../../src/features/watch/stop';
import type { Json } from '../../../src/shared/engine-request';
import type { Outcome, Plan } from '../../../src/shared/feature';
import { contextOf } from '../connection/context';
import { production } from '../history/recorded';
import { changeEvent, onPage, orders, pageOf, stateWithPage, tab } from './page';

function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

function watching(): WatchPages {
  const opened = reduceWatchPages({}, { kind: 'opened', tab, watched: orders });
  const starting = reduceWatchPages(opened, { kind: 'starting', tab });
  return reduceWatchPages(starting, {
    kind: 'received',
    tab,
    events: [],
    resumeToken: { _data: 'a' },
    invalidated: false,
  });
}

const received = (pages: WatchPages, numbers: readonly number[]): WatchPages =>
  reduceWatchPages(pages, {
    kind: 'received',
    tab,
    events: numbers.map((number) => changeEvent(number)),
    invalidated: false,
  });

describe('watch.pause', () => {
  it('holds the new change events out of the list, then adds them in order', () => {
    let pages = reduceWatchPages(watching(), { kind: 'paused', tab, paused: true });
    pages = received(pages, [1, 2, 3]);
    expect(pages[tab]?.events).toEqual([]);
    expect(pauseLabel(pages[tab] ?? pageOf())).toBe('Resume (3)');
    pages = reduceWatchPages(pages, { kind: 'paused', tab, paused: false });
    expect(pages[tab]?.events.map((event) => event.number)).toEqual([1, 2, 3]);
    expect(pages[tab]).toMatchObject({ paused: false, status: 'watching', held: [] });
  });

  it('ends the pause when the stream stops or fails, and Clear empties what is held', () => {
    const paused = received(reduceWatchPages(watching(), { kind: 'paused', tab, paused: true }), [1]);
    expect(reduceWatchPages(paused, { kind: 'stopped', tab })[tab]).toMatchObject({
      paused: false,
      events: [{ number: 1 }],
    });
    const failed = reduceWatchPages(paused, { kind: 'failed', tab, message: { kind: 'error', text: 'x' } });
    expect(failed[tab]?.events).toHaveLength(1);
    expect(reduceWatchPages(paused, { kind: 'cleared', tab })[tab]).toMatchObject({ held: [], events: [], dropped: 0 });
  });

  it('paused for 1,500 change events, shows the newest 1,000 and counts the others', () => {
    let pages = reduceWatchPages(watching(), { kind: 'paused', tab, paused: true });
    pages = received(
      pages,
      Array.from({ length: 1500 }, (_, index) => index + 1),
    );
    pages = reduceWatchPages(pages, { kind: 'paused', tab, paused: false });
    expect(pages[tab]?.events).toHaveLength(1000);
    expect(pages[tab]?.events[0]?.number).toBe(501);
    expect(pages[tab]?.dropped).toBe(500);
  });

  it('is an app step on the page, and works on a read-only connection', () => {
    const page = pageOf({ status: 'watching' }, { ...orders, connection: production.id });
    const paused = planOf(pause(onPage('watch.pause', page), {}));
    expect(paused.steps).toEqual([
      {
        kind: 'app',
        text: 'hold the new change events out of the list',
        action: 'watch.pause',
        args: { tab, paused: true },
      },
    ]);
    expect(paused.danger).toEqual({ kind: 'none' });
  });
});

describe('watch.stop', () => {
  it('closes the stream when it is open', () => {
    const stopped = planOf(stop(onPage('watch.stop', pageOf({ status: 'watching' })), {}));
    expect(stopped.steps).toEqual([
      { kind: 'app', text: 'close the change stream', action: 'watch.close-stream', args: { tab } },
    ]);
  });

  it('opens the stream from now with the Filter and the options of the page when it is stopped or failed', () => {
    const page = pageOf({
      status: 'error',
      filter: '{ a: 1 }',
      fullDocument: false,
      resumeToken: { _data: 'r' },
      nextNumber: 9,
    });
    const started = planOf(stop(onPage('watch.stop', page), {}));
    expect(started.steps).toEqual([]);
    expect(started.after).toEqual([
      {
        kind: 'start',
        feature: 'watch.stream',
        target: { kind: 'tab', tab },
        args: { tab, ...orders, filter: '{ a: 1 }', fullDocument: false, nextNumber: 9 },
      },
    ]);
  });

  it('leaves the list as it is, and a stopped empty page says to press Start', () => {
    const pages = reduceWatchPages(received(watching(), [1]), { kind: 'stopped', tab });
    expect(pages[tab]).toMatchObject({ status: 'stopped', events: [{ number: 1 }] });
  });
});

describe('watch.resume', () => {
  it('opens the stream after the last resume token, and only when there is one', () => {
    const page = pageOf({ status: 'stopped', resumeToken: { _data: 'last' } });
    const resumed = planOf(resume(onPage('watch.resume', page), {}));
    expect(resumed.after[0]).toMatchObject({
      kind: 'start',
      feature: 'watch.stream',
      args: { resumeAfter: { _data: 'last' } },
    });
    expect(planOf(resume(onPage('watch.resume', pageOf({ status: 'stopped' })), {})).after).toEqual([]);
    expect(planOf(resume(onPage('watch.resume', pageOf({ status: 'watching', resumeToken: 1 })), {})).after).toEqual(
      [],
    );
  });

  it('refuses when the oplog no longer holds the point of the token', () => {
    expect(resumeError({ code: 286, message: 'ChangeStreamHistoryLost' })).toEqual({
      kind: 'refuse',
      code: 'watch.resume/history-lost',
      message:
        'The changes after the last change event are no longer in the oplog: the stream can only start from now.',
    });
    expect(resumeError({ code: 260, message: 'InvalidResumeToken' })).toBeUndefined();
  });

  it('is not forgotten by Clear', () => {
    const cleared = reduceWatchPages(watching(), { kind: 'cleared', tab });
    expect(cleared[tab]?.resumeToken).toEqual({ _data: 'a' });
  });
});

describe('watch.clear', () => {
  it('empties the list with an app step; the next change event has the next number', () => {
    const cleared = planOf(clear(onPage('watch.clear', pageOf()), {}));
    expect(cleared.steps).toEqual([
      { kind: 'app', text: 'remove the change events from the list', action: 'watch.clear', args: { tab } },
    ]);
    let pages = reduceWatchPages(received(watching(), [1, 2]), { kind: 'selected', tab, number: 2 });
    pages = reduceWatchPages(pages, { kind: 'cleared', tab });
    expect(pages[tab]).toMatchObject({ events: [], dropped: 0, nextNumber: 3 });
    expect(pages[tab]?.selected).toBeUndefined();
  });
});

describe('watch.enable-pre-images', () => {
  it('runs collMod after a confirmation with the button Enable', () => {
    const plan = planOf(enablePreImages(onPage('watch.enable-pre-images', pageOf()), {}));
    expect(plan.title).toBe('Record pre-images of shop.orders?');
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: 'Enables changeStreamPreAndPostImages on the collection (collMod): from now on, the document before each update, replace and delete is stored, so it can be shown here. It uses storage, and is a change to the collection options.',
      button: 'Enable',
    });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      kind: 'engine',
      writes: true,
      request: {
        database: 'shop',
        method: 'runCommand',
        arguments: [{ collMod: 'orders', changeStreamPreAndPostImages: { enabled: true } }],
      },
    });
    expect(plan.undo).toHaveProperty('cannot');
  });

  it('is refused on a read-only connection, and says the server error', () => {
    const page = pageOf({}, { ...orders, connection: production.id });
    expect(enablePreImages(onPage('watch.enable-pre-images', page), {})).toEqual({
      kind: 'refuse',
      code: 'watch.enable-pre-images/read-only',
      message: "The connection Production is read-only: the collection options can't be changed.",
    });
    expect(preImagesFailed({ code: 13, message: 'not authorized on shop to execute command { collMod' })).toBe(
      'Pre-images not enabled: not authorized on shop to execute command { collMod',
    );
  });
});

describe('watch.copy-events', () => {
  it('copies a change event as the server sent it, and says so', () => {
    const page = pageOf({ events: [changeEvent(1)] });
    const copied = planOf(copyEvents(onPage('watch.copy-events', page), { args: { number: 1 } }));
    const copy = copied.after[0];
    expect(copy?.kind).toBe('copy');
    expect(copy?.kind === 'copy' ? copy.text : '').toContain('operationType: "insert"');
    expect(copy?.kind === 'copy' ? copy.text : '').toContain('documentKey: { _id: 1 }');
    expect(copied.after[1]).toEqual({ kind: 'notify', level: 'success', text: 'Copied to the clipboard' });
  });

  it('copies the events shown as a list, oldest first, without those hidden', () => {
    const update = changeEvent(2, 'update', { updateDescription: { updatedFields: { a: 1 } } });
    const page = pageOf({ events: [changeEvent(1), update, changeEvent(3)], hiddenTypes: ['update'] });
    const copied = planOf(copyEvents(onPage('watch.copy-events', page), { args: { shown: true } }));
    const text = copied.after[0]?.kind === 'copy' ? copied.after[0].text : '';
    expect(text.startsWith('[')).toBe(true);
    expect(text.indexOf('token-1')).toBeLessThan(text.indexOf('token-3'));
    expect(text).not.toContain('token-2');
  });
});

describe('watch.export', () => {
  const page = pageOf({ events: [changeEvent(1), changeEvent(2, 'delete'), changeEvent(3)] });

  it('refuses an empty list', () => {
    expect(exportEvents(onPage('watch.export', pageOf()), {})).toEqual({
      kind: 'refuse',
      code: 'watch.export/nothing-to-export',
      message: 'There is no change event to export.',
    });
  });

  it('asks only for the file when nothing is hidden, then writes one change event a line, oldest first', () => {
    const context = onPage('watch.export', page);
    expect(exportEvents(context, { args: { offsetMinutes: 60 } })).toEqual({
      kind: 'read',
      need: {
        key: 'file',
        read: 'watch.export:file',
        args: { mode: 'save', name: 'watch-orders-20251117-182000.jsonl' },
      },
    });
    const plan = planOf(exportEvents(context, { file: 'C:\\exports\\watch-orders.jsonl' }));
    const step = plan.steps[0];
    expect(step?.kind === 'file' ? step.text : '').toBe('write C:\\exports\\watch-orders.jsonl');
    const text = step?.kind === 'file' ? (step.content?.args as { readonly text: string }).text : '';
    const lines = text.trimEnd().split('\n');
    expect(lines).toHaveLength(3);
    expect((JSON.parse(lines[0] ?? '{}') as { _id: Json })._id).toEqual({ _data: 'token-1' });
    expect(plan.after).toEqual([
      { kind: 'notify', level: 'success', text: 'Exported 3 change events to C:\\exports\\watch-orders.jsonl' },
    ]);
  });

  it('asks which ones when the toggles hide some, and writes the hidden only with All', () => {
    const hiding = pageOf({ ...page, hiddenTypes: ['delete'] });
    const context = onPage('watch.export', hiding);
    expect(exportEvents(context, {})).toMatchObject({
      kind: 'ask',
      question: { fields: [{ choices: [{ label: 'The 2 shown' }, { label: 'All 3' }] }] },
    });
    const textOf = (outcome: Outcome): string => {
      const step = planOf(outcome).steps[0];
      return step?.kind === 'file' ? (step.content?.args as { readonly text: string }).text : '';
    };
    expect(textOf(exportEvents(context, { which: 'shown', file: 'f.jsonl' }))).not.toContain('token-2');
    expect(textOf(exportEvents(context, { which: 'all', file: 'f.jsonl' }))).toContain('token-2');
  });

  it('keeps every type as canonical Extended JSON', () => {
    const long = changeEvent(4, 'update', { updateDescription: { updatedFields: { total: { $numberLong: '5' } } } });
    const context = contextOf('watch.export', stateWithPage(pageOf({ events: [long] })), { kind: 'tab', tab });
    const step = planOf(exportEvents(context, { file: 'f.jsonl' })).steps[0];
    const text = step?.kind === 'file' ? (step.content?.args as { readonly text: string }).text : '';
    expect(text).toContain('{"$numberLong":"5"}');
    expect(text).toContain('"wallTime":{"$date":{"$numberLong":"1763400000004"}}');
    expect(exportFileName('Local', 0, 0)).toBe('watch-Local-19700101-000000.jsonl');
  });
});
