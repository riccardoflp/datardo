import { describe, expect, it } from 'vitest';
import { tabId } from '../../../src/shared/ids';
import { decodedText, fileName, plan, textRead } from '../../../src/features/playground/open-file';
import {
  argsOf,
  cache,
  contextOf,
  local,
  planOf,
  playgroundOf,
  playgroundTabOf,
  production,
  questionOf,
  stateOf,
} from './context';

const path = 'C:/work/report.mongodb.js';
const text = { kind: 'text', text: 'db.dropDatabase()' };

describe('playground.open-file', () => {
  it('asks for the file, then reads its text and what Datardo remembers of it', () => {
    const state = stateOf();
    expect(plan(contextOf('playground.open-file', state), {})).toEqual({
      kind: 'read',
      need: { key: 'file', read: 'playground.open-file:file', args: null },
    });
    expect(plan(contextOf('playground.open-file', state), { file: path })).toEqual({
      kind: 'read',
      need: { key: 'text', read: 'playground.open-file:text', args: { path, largest: 5 * 1024 * 1024 } },
    });
    expect(plan(contextOf('playground.open-file', state), { file: path, text })).toEqual({
      kind: 'read',
      need: { key: 'remembered', read: 'playground.open-file:remembered', args: { path } },
    });
  });

  it('opens a file again on the connection and database it had, without a question', () => {
    const found = planOf(
      plan(contextOf('playground.open-file', stateOf()), {
        file: path,
        text,
        remembered: { connection: production.id, database: 'shop' },
      }),
    );
    expect(found.steps[0]?.text).toBe(`open the playground ${path}`);
    expect(argsOf(found, 'playground.open')).toEqual({
      connection: production.id,
      database: 'shop',
      file: path,
      title: 'report.mongodb.js',
      text: 'db.dropDatabase()',
      caret: 'start',
    });
  });

  it('opens a file never opened on the current connection, with the database of the active tab, else test', () => {
    const answers = { file: path, text, remembered: null };
    const onTest = planOf(plan(contextOf('playground.open-file', stateOf({ current: local })), answers));
    expect(argsOf(onTest, 'playground.open')).toMatchObject({ connection: local.id, database: 'test' });
    const withTab = stateOf({
      current: local,
      tabs: [playgroundTabOf(tabId('t1'), 'Playground 1')],
      playgrounds: { t1: playgroundOf('', { defaultDatabase: 'archive' }) },
    });
    expect(argsOf(planOf(plan(contextOf('playground.open-file', withTab), answers)), 'playground.open')).toMatchObject({
      database: 'archive',
    });
  });

  it('asks for the connection with a Redis connection current, or a remembered one removed', () => {
    const state = stateOf({ saved: [local, cache], current: cache });
    expect(
      questionOf(plan(contextOf('playground.open-file', state), { file: path, text, remembered: null })).title,
    ).toBe('Playground connection');
    const removed = { connection: 'c-gone', database: 'shop' };
    expect(
      questionOf(plan(contextOf('playground.open-file', state), { file: path, text, remembered: removed })).title,
    ).toBe('Playground connection');
  });

  it('opens nothing when the dialog is closed', () => {
    expect(planOf(plan(contextOf('playground.open-file', stateOf()), { file: null })).steps).toEqual([]);
  });

  it('makes the tab of a file already open active instead of opening it twice', () => {
    const state = stateOf({
      tabs: [
        playgroundTabOf(tabId('t1'), 'Playground 1'),
        playgroundTabOf(tabId('t2'), 'report.mongodb.js', local, path),
      ],
      active: tabId('t1'),
    });
    const found = planOf(plan(contextOf('playground.open-file', state), { file: path }));
    expect(found.steps.some((each) => each.kind === 'app' && each.action === 'playground.open')).toBe(false);
    expect(found.steps.length).toBeGreaterThan(0);
  });

  it('refuses a file that is missing, too large, not text, or cannot be read', () => {
    const state = stateOf();
    const refusal = (found: unknown): unknown =>
      plan(contextOf('playground.open-file', state), { file: path, text: found });
    expect(refusal({ kind: 'missing' })).toEqual({
      kind: 'refuse',
      code: 'playground.open-file/no-file',
      message: `The file ${path} doesn't exist.`,
    });
    expect(refusal({ kind: 'too-large' })).toEqual({
      kind: 'refuse',
      code: 'playground.open-file/too-large',
      message: 'report.mongodb.js is too large to open as a playground (over 5 MB).',
    });
    expect(refusal({ kind: 'not-text' })).toMatchObject({ code: 'playground.open-file/not-text' });
    expect(refusal({ kind: 'failed', error: 'EBUSY' })).toMatchObject({
      code: 'playground.open-file/open-failed',
      message: 'Could not open report.mongodb.js: EBUSY',
    });
  });

  it('refuses with no MongoDB connection saved', () => {
    expect(plan(contextOf('playground.open-file', stateOf({ saved: [cache], states: {} })), {})).toMatchObject({
      code: 'playground.open-file/no-connection',
    });
  });

  it('reads UTF-8 text only, and names the file by its path', () => {
    expect(decodedText(new TextEncoder().encode('é'))).toBe('é');
    expect(decodedText(new Uint8Array([0xff, 0xfe, 0x00]))).toBeUndefined();
    expect(fileName('C:\\work\\a.js')).toBe('a.js');
    expect(textRead.request(contextOf('playground.open-file', stateOf()), { path, largest: 1 })).toEqual({
      kind: 'app',
      action: 'playground.read-file',
      args: { path, largest: 1 },
    });
  });
});
