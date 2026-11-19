import { at, task } from './harness';
import { describe, expect, it } from 'vitest';
import { view } from '../../../src/features/task/notify';
import type { TaskRun } from '../../../src/features/task/types';

const start = at(2026, 11, 11, 2);
const show = { kind: 'show', label: 'Show scheduled tasks', element: 'task.show@notification' };

function run(more: Partial<TaskRun>): TaskRun {
  return { start, end: start + 12_400, trigger: 'schedule', status: 'done', ...more };
}

describe('task.notify', () => {
  it('tells a failed run at once, with Show scheduled tasks', () => {
    expect(view({ task: task(), run: run({ status: 'failed', error: 'disk full' }), hidden: false })).toEqual({
      level: 'error',
      text: 'Scheduled task "Back up shop" failed: disk full',
      buttons: [show],
      system: false,
    });
  });

  it('warns of a skipped run', () => {
    expect(
      view({ task: task(), run: run({ status: 'skipped', error: 'The connection was removed' }), hidden: false }),
    ).toMatchObject({
      level: 'warning',
      text: 'Scheduled task "Back up shop" was skipped: The connection was removed',
    });
  });

  it('tells a successful run only when the task asks, with Reveal and Show scheduled tasks', () => {
    const done = run({
      collections: 2,
      documents: 1200,
      size: 3_565_158,
      output: 'D:\\backups\\shop_2026-11-11_02-00-00.agz',
    });
    expect(view({ task: task(), run: done, hidden: false })).toBeUndefined();
    expect(view({ task: task({ notifySuccess: true }), run: done, hidden: false })).toEqual({
      level: 'success',
      text: 'Scheduled task "Back up shop" done (2 collections, 1,200 documents, 3.4 MB) in 12.4 s: shop_2026-11-11_02-00-00.agz',
      buttons: [{ kind: 'reveal', label: 'Reveal', path: 'D:\\backups\\shop_2026-11-11_02-00-00.agz' }, show],
      system: false,
    });
  });

  it('leaves the collections out of an export', () => {
    const exported = task({ kind: 'export', collection: 'orders', format: 'jsonl', notifySuccess: true });
    const done = run({ documents: 3, size: 100, output: 'D:\\backups\\orders.jsonl' });
    expect(view({ task: exported, run: done, hidden: false })?.text).toBe(
      'Scheduled task "Back up shop" done (3 documents, 100 B) in 12.4 s: orders.jsonl',
    );
  });

  it('shows nothing for a cancelled or a missed run', () => {
    const asked = task({ notifySuccess: true });
    expect(view({ task: asked, run: run({ status: 'cancelled' }), hidden: false })).toBeUndefined();
    expect(view({ task: asked, run: run({ status: 'missed' }), hidden: true })).toBeUndefined();
  });

  it('uses a notification of the system for a failed or a skipped run while the window is in the tray', () => {
    expect(view({ task: task(), run: run({ status: 'failed', error: 'x' }), hidden: true })?.system).toBe(true);
    expect(view({ task: task(), run: run({ status: 'skipped', error: 'x' }), hidden: true })?.system).toBe(true);
  });

  it('gives the seconds of a successful run one decimal', () => {
    const asked = task({ notifySuccess: true });
    const text = view({
      task: asked,
      run: run({ end: start + 12_000, documents: 1, size: 1, collections: 1 }),
      hidden: false,
    })?.text;
    expect(text).toContain('in 12.0 s');
  });
});
