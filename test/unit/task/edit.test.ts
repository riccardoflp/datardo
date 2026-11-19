import {
  appStateWith,
  at,
  cacheConnection,
  connection,
  contextOf,
  localConnection,
  stepsOf,
  stepTexts,
  task,
  tasksWith,
} from './harness';
import { describe, expect, it } from 'vitest';
import {
  formProblems,
  formView,
  newTaskForm,
  plan,
  taskFromForm,
  withKind,
  type TaskForm,
} from '../../../src/features/task/edit';
import type { ScheduledTask } from '../../../src/features/task/types';

const connections = [localConnection, cacheConnection];
const shopForm = newTaskForm({ connection: localConnection.id, database: 'shop' }, connections, 'D:\\backups');
const now = at(2026, 11, 11, 9);

function saved(form: TaskForm, old?: ScheduledTask, saving = now): ScheduledTask {
  const outcome = plan(contextOf('task.edit', appStateWith(tasksWith(old === undefined ? [] : [old])), saving), {
    args: { form: form as never, ...(old === undefined ? {} : { task: old.id }) },
  });
  const step = stepsOf(outcome)[0];
  if (step?.kind !== 'app') {
    throw new Error('task.edit made no plan.');
  }
  return (step.args as unknown as { task: ScheduledTask }).task;
}

function message(form: TaskForm): string {
  const step = stepsOf(
    plan(contextOf('task.edit', appStateWith(tasksWith([])), now), { args: { form: form as never } }),
  )[0];
  return step?.kind === 'app' ? (step.args as { message: string }).message : '';
}

describe('task.edit', () => {
  it('opens Schedule… on the database shop with a daily backup at 02:00 that keeps 7', () => {
    expect(shopForm).toMatchObject({
      name: 'Back up shop',
      kind: 'backup',
      format: 'archive',
      connection: localConnection.id,
      database: 'shop',
      collection: '',
      when: 'daily',
      time: '02:00',
      keep: '7',
      enabled: true,
      runMissed: false,
      notifySuccess: false,
    });
    expect(formView({ form: shopForm, connections, touched: [], now }).formats[0]?.label).toBe('Archive (.agz)');
  });

  it('names a task of a collection after it, and renames a default name when the kind changes', () => {
    const orders = newTaskForm(
      { connection: localConnection.id, database: 'shop', collection: 'orders' },
      connections,
      'D:\\backups',
    );
    expect(orders.name).toBe('Back up shop.orders');
    const exported = withKind(orders, 'export', connections);
    expect(exported).toMatchObject({ name: 'Export shop.orders', format: 'jsonl' });
    expect(withKind(exported, 'backup', connections)).toMatchObject({ name: 'Back up shop.orders', format: 'archive' });
    expect(withKind({ ...orders, name: 'Nightly orders' }, 'export', connections).name).toBe('Nightly orders');
    expect(newTaskForm({}, connections, '').name).toBe('Backup');
    expect(newTaskForm({ connection: localConnection.id }, connections, '').name).toBe('Back up Local');
  });

  it('refuses an export with no collection and saves nothing', () => {
    const form = withKind(shopForm, 'export', connections);
    expect(formProblems(form).collection).toBe('An export is of one collection: enter it');
    const outcome = plan(contextOf('task.edit', appStateWith(tasksWith([])), now), { args: { form: form as never } });
    expect(outcome).toMatchObject({ kind: 'refuse', code: 'task.edit/invalid' });
  });

  it('says what is wrong with each field', () => {
    const wrong: TaskForm = {
      ...withKind(shopForm, 'export', connections),
      name: ' ',
      connection: '',
      database: '',
      filter: 'status',
      folder: '',
      pattern: 'backup',
      when: 'hours',
      every: 5,
      time: '25:00',
      keep: '-1',
    };
    expect(formProblems(wrong)).toEqual({
      name: 'Enter a name',
      connection: 'Choose a connection',
      database: 'Enter the database',
      collection: 'An export is of one collection: enter it',
      filter: 'Filter must be an object, e.g. { status: "active" }',
      folder: 'Choose the folder',
      pattern: 'Include the date or time, e.g. {date}_{time}, so the runs write different files',
      time: 'Enter a time as HH:MM, e.g. 02:30',
      every: 'Every 1, 2, 3, 4, 6, 8, 12 hours',
      keep: 'Enter how many to keep (0: all)',
    });
    expect(
      formProblems({ ...shopForm, kind: 'export', collection: 'orders', projection: '{ total' }, () => ({
        kind: 'error',
        error: 'Unexpected end',
      })).projection,
    ).toBe('Projection: Unexpected end');
    expect(formProblems({ ...shopForm, database: '', collection: 'orders' }).database).toBe(
      'Enter the database of the collection',
    );
  });

  it('shows the problems of the fields touched only, and the example name under the file name', () => {
    const form = { ...shopForm, name: '', pattern: 'backup' };
    expect(formView({ form, connections, touched: ['pattern'], now }).problems).toEqual({
      pattern: 'Include the date or time, e.g. {date}_{time}, so the runs write different files',
    });
    expect(formView({ form, connections, touched: 'all', now }).problems.name).toBe('Enter a name');
    expect(formView({ form: shopForm, connections, touched: [], now }).example).toBe(
      'e.g. shop_2026-11-11_09-00-00.agz',
    );
  });

  it('shows the next three runs, and none while a weekly schedule has no day', () => {
    expect(formView({ form: shopForm, connections, touched: [], now: at(2026, 11, 11, 1) }).preview).toBe(
      'Daily at 02:00. Next: today 02:00, tomorrow 02:00, Fri 13 Nov 02:00',
    );
    const weekly = { ...shopForm, when: 'weekly' as const, days: [] };
    expect(formProblems(weekly).days).toBe('Choose at least one day');
    expect(formView({ form: weekly, connections, touched: [], now }).preview).toBe('');
  });

  it('says the next run once saved, or that the task is disabled', () => {
    expect(message(shopForm)).toBe('Saved "Back up shop" (Daily at 02:00). Next run: tomorrow 02:00.');
    expect(message({ ...shopForm, enabled: false })).toBe('Saved "Back up shop" (Daily at 02:00). It is disabled.');
    expect(
      stepTexts(plan(contextOf('task.edit', appStateWith(tasksWith([])), now), { args: { form: shopForm as never } })),
    ).toEqual(['save the scheduled task "Back up shop"']);
  });

  it('keeps when the runs count from when only the name changes, and restarts them when the time changes', () => {
    const old = task({ schedule: { kind: 'daily', time: '02:00' }, since: at(2026, 1, 1) });
    expect(saved({ ...shopForm, name: 'Nightly' }, old).since).toBe(at(2026, 1, 1));
    expect(saved({ ...shopForm, time: '03:00' }, old).since).toBe(now);
    expect(saved(shopForm, { ...old, enabled: false }).since).toBe(now);
    expect(saved(shopForm).since).toBe(now);
  });

  it('offers no Redis connection, and refuses one that is no longer saved', () => {
    expect(formView({ form: shopForm, connections, touched: [], now }).connections).toEqual([
      { value: localConnection.id, label: 'Local' },
    ]);
    const gone = plan(contextOf('task.edit', appStateWith(tasksWith([]), [cacheConnection]), now), {
      args: { form: shopForm as never },
    });
    expect(gone).toMatchObject({ kind: 'refuse', code: 'task.edit/no-connection', message: 'Choose a connection' });
    const redis = plan(contextOf('task.edit', appStateWith(tasksWith([])), now), {
      args: { form: { ...shopForm, connection: cacheConnection.id } as never },
    });
    expect(redis).toMatchObject({ kind: 'refuse', code: 'task.edit/no-connection' });
  });

  it('saves a task on a read-only connection', () => {
    const readOnly = connection('c-local', 'Local', { readOnly: true });
    const outcome = plan(contextOf('task.edit', appStateWith(tasksWith([]), [readOnly]), now), {
      args: { form: shopForm as never },
    });
    expect(outcome.kind).toBe('run');
  });

  it('stores the engine of the connection, and keeps it when the task is saved again', () => {
    const first = saved(shopForm);
    expect(first).toMatchObject({ engine: 'mongodb', connection: localConnection.id, id: `t-${now.toString(36)}` });
    expect(saved({ ...shopForm, name: 'Again' }, first).engine).toBe('mongodb');
  });

  it('keeps the filter and the projection of an export only', () => {
    const exported = {
      ...withKind(shopForm, 'export', connections),
      collection: 'orders',
      filter: ' { status: "open" } ',
      projection: '{ total: 1 }',
    };
    expect(taskFromForm(exported, { id: task().id, connection: localConnection, now })).toMatchObject({
      filter: '{ status: "open" }',
      projection: '{ total: 1 }',
    });
    expect(
      taskFromForm(
        { ...exported, kind: 'backup', format: 'archive' },
        { id: task().id, connection: localConnection, now },
      ),
    ).not.toHaveProperty('filter');
  });
});
