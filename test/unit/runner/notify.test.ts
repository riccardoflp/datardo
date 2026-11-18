import { describe, expect, it } from 'vitest';
import { errorMessage, withoutSecrets } from '../../../src/features/runner/error';
import { notifiesTheSystem, view as notifyView } from '../../../src/features/runner/notify';
import { disabledBecause, view as refuseView } from '../../../src/features/runner/refuse';
import { notify, reportRefusal } from '../../../src/runner/notify';
import { start } from '../../../src/runner/start';
import { refuse, run, type OperationFeature } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import { appTarget } from '../../../src/shared/target';
import { delStep, harness, planOf } from './harness';

const feature = featureId('test.feature');

describe('runner.notify', () => {
  it('has a kind, its text, and at most two actions', () => {
    const test = harness();
    const action = { label: 'Undo', feature: featureId('undo.run'), target: appTarget };
    notify(test.ports, { feature, level: 'success', text: 'Deleted 3 keys.', actions: [action, action, action] });
    const [shown] = notifyView(test.state().runner);
    expect(shown).toMatchObject({ level: 'success', text: 'Deleted 3 keys.' });
    expect(shown?.actions).toHaveLength(2);
  });

  it('lets info and success go away after 6 seconds, and keeps warnings and errors', () => {
    const test = harness();
    for (const level of ['info', 'success', 'warning', 'error'] as const) {
      notify(test.ports, { feature, level, text: level });
    }
    const shown = notifyView({ notifications: test.state().runner.notifications.slice(0, 2) });
    expect(shown.map((item) => item.goesAwayAfterMs)).toEqual([6000, 6000]);
    const kept = notifyView({ notifications: test.state().runner.notifications.slice(2) });
    expect(kept.map((item) => item.goesAwayAfterMs)).toEqual([undefined, undefined]);
  });

  it('shows at most 3 at once, the newest at the bottom', () => {
    const test = harness();
    for (const text of ['one', 'two', 'three', 'four']) {
      notify(test.ports, { feature, level: 'warning', text });
    }
    expect(notifyView(test.state().runner).map((item) => item.text)).toEqual(['two', 'three', 'four']);
  });

  it('counts the same message within 30 seconds on the one shown', () => {
    const test = harness();
    notify(test.ports, { feature, level: 'warning', text: 'Same.' });
    test.advance(10_000);
    notify(test.ports, { feature, level: 'warning', text: 'Same.' });
    notify(test.ports, { feature, level: 'warning', text: 'Same.' });
    const shown = notifyView(test.state().runner);
    expect(shown).toHaveLength(1);
    expect(shown[0]?.times).toBe('×3');
    test.advance(31_000);
    notify(test.ports, { feature, level: 'warning', text: 'Same.' });
    expect(notifyView(test.state().runner)).toHaveLength(2);
  });

  it('is also a line of the Log, which Show in log finds', () => {
    const test = harness();
    notify(test.ports, { feature, level: 'info', text: 'Saved.' });
    const [shown] = notifyView(test.state().runner);
    const line = test.state().runner.log.find((item) => item.id === shown?.logLine);
    expect(line).toMatchObject({ kind: 'notification', text: '[test.feature] Saved.' });
  });

  it('tells a screen reader of an error at once, and of the others politely', () => {
    const test = harness();
    notify(test.ports, { feature, level: 'error', text: 'Failed.' });
    notify(test.ports, { feature, level: 'info', text: 'Done.' });
    expect(notifyView(test.state().runner).map((item) => item.announce)).toEqual(['assertive', 'polite']);
  });

  it('tells the system when work longer than 30 seconds ends while the window is not in front', () => {
    expect(notifiesTheSystem({ durationMs: 31_000, windowInFront: false, setting: true })).toBe(true);
    expect(notifiesTheSystem({ durationMs: 31_000, windowInFront: true, setting: true })).toBe(false);
    expect(notifiesTheSystem({ durationMs: 29_000, windowInFront: false, setting: true })).toBe(false);
    expect(notifiesTheSystem({ durationMs: 31_000, windowInFront: false, setting: false })).toBe(false);
  });
});

describe('runner.refuse', () => {
  const refusing: OperationFeature = {
    kind: 'operation',
    id: featureId('test.refusing'),
    plan: () => refuse('test.refusing/read-only', 'The connection Production is read-only.'),
  };

  it('shows a refusal as a warning, with its code under Details', async () => {
    const test = harness({ features: [refusing] });
    await start(test.ports, { feature: refusing.id, target: appTarget });
    expect(test.state().runner.notifications).toMatchObject([
      { level: 'warning', text: 'The connection Production is read-only.', details: 'test.refusing/read-only' },
    ]);
    expect(test.state().runner.dialogs).toEqual([]);
    expect(refuseView({ code: 'test.refusing/read-only', message: 'No.' })).toEqual({
      level: 'warning',
      text: 'No.',
      details: 'test.refusing/read-only',
    });
  });

  it('writes the code and the message in the Log', async () => {
    const test = harness({ features: [refusing] });
    await start(test.ports, { feature: refusing.id, target: appTarget });
    expect(test.log()).toEqual([
      '[test.refusing] refused: test.refusing/read-only The connection Production is read-only.',
    ]);
  });

  it('says why a control that would certainly be refused is disabled', () => {
    expect(disabledBecause({ connection: 'Production', readOnly: true, connected: true })).toBe(
      'The connection Production is read-only.',
    );
    expect(disabledBecause({ connection: 'Local', readOnly: false, connected: false })).toBe('Local is not connected.');
    expect(disabledBecause({ connection: 'Local', readOnly: false, connected: true, view: 'totals' })).toBe(
      'totals is a view: it cannot be written to.',
    );
    expect(disabledBecause({ connection: 'Local', readOnly: false, connected: true })).toBeUndefined();
  });

  it('returns a refusal to a tool of the MCP server, with no notification', () => {
    const test = harness();
    reportRefusal(test.ports, { feature, code: 'test.feature/no' as never, message: 'No.' }, 'mcp');
    expect(test.state().runner.notifications).toEqual([]);
    expect(test.log()).toEqual(['[test.feature] refused: test.feature/no No.']);
  });
});

describe('runner.error', () => {
  it.each([
    [{ code: 13, message: 'not authorized' }, 'not allowed', 'The user of Local is not allowed to do this.'],
    [{ code: 50, message: 'exceeded time limit' }, 'timed out', 'The server took longer than 60 seconds.'],
    [
      { code: 11000, message: 'E11000 duplicate key error collection: shop.users index: email_1 dup key' },
      'conflict',
      'A document with the same email_1 already exists.',
    ],
    [{ name: 'MongoNetworkError', message: 'connection closed' }, 'not connected', 'Local is not connected.'],
    [{ message: 'NOAUTH Authentication required.' }, 'not allowed', 'The user of Local is not allowed to do this.'],
    [{ message: 'WRONGTYPE Operation against a key' }, 'invalid', 'The key holds another type of value.'],
    [
      { message: "READONLY You can't write against a read only replica." },
      'not allowed',
      'This server is a replica and does not accept writes.',
    ],
    [{ message: 'OOM command not allowed' }, 'other', 'The server is out of memory.'],
    [{ message: 'Socket closed unexpectedly' }, 'not connected', 'Local is not connected.'],
    [{ code: 'ENOSPC', message: 'no space left' }, 'disk', 'The disk is full.'],
    [
      { code: 'EACCES', message: 'permission denied', path: 'C:\\out.json' },
      'not allowed',
      'Datardo may not write to C:\\out.json.',
    ],
    [{ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }, 'not connected', 'Local is not connected.'],
  ])('gives %o its kind and its message', (error, kind, message) => {
    expect(errorMessage(error, { connection: 'Local' })).toMatchObject({ kind, message });
  });

  it('never shows a password of a connection string', () => {
    const shown = errorMessage(new Error('could not reach mongodb://app:s3cret@host:27017'));
    expect(shown.message).toBe('could not reach mongodb://app:***@host:27017');
    expect(shown.details).not.toContain('s3cret');
    expect(withoutSecrets('redis://:pa55@cache:6379')).toBe('redis://:***@cache:6379');
  });

  it('offers Reconnect with an error of the kind not connected', async () => {
    const plan = planOf('Delete', [delStep('a')]);
    const feature: OperationFeature = { kind: 'operation', id: featureId('test.delete'), plan: () => run(plan) };
    const test = harness({
      features: [feature],
      server: () => Promise.reject(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })),
    });
    await start(test.ports, { feature: feature.id, target: appTarget });
    expect(test.state().runner.notifications.at(-1)).toMatchObject({
      level: 'error',
      text: 'Stopped at step 1 of 1. Local is not connected.',
      actions: [
        { label: 'Reconnect', feature: 'connection.connect', target: { kind: 'connection', connection: 'local' } },
      ],
    });
  });
});
