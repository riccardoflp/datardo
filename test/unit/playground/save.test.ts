import { describe, expect, it } from 'vitest';
import { plan, saveFailedMessage, withExtension } from '../../../src/features/playground/save';
import { argsOf, contextOf, firstTab, local, planOf, playgroundTabOf, withPlayground } from './context';

const saved = 'C:/work/report.mongodb.js';

function onFile(text: string, savedText: string): ReturnType<typeof withPlayground> {
  return withPlayground(text, { savedText }, { tabs: [playgroundTabOf(firstTab, 'report.mongodb.js', local, saved)] });
}

describe('playground.save', () => {
  it('asks for the file of a playground that has none, offering Playground 1.mongodb.js', () => {
    expect(plan(contextOf('playground.save', withPlayground('a = 1')), {})).toEqual({
      kind: 'read',
      need: { key: 'file', read: 'playground.save:file', args: { name: 'Playground 1.mongodb.js' } },
    });
  });

  it('saves report as report.mongodb.js, then remembers its connection and database', () => {
    const found = planOf(plan(contextOf('playground.save', withPlayground('a = 1')), { file: 'C:/work/report' }));
    expect(found.steps.map((each) => each.text)).toEqual([
      expect.stringContaining('C:/work/report.mongodb.js'),
      'remember the connection and the database of C:/work/report.mongodb.js',
    ]);
    expect(found.steps[0]).toMatchObject({
      kind: 'file',
      action: 'write',
      path: 'C:/work/report.mongodb.js',
      content: { writer: 'playground.text', args: { text: 'a = 1' } },
    });
    expect(argsOf(found, 'playground.remember')).toEqual({
      tab: 't1',
      path: 'C:/work/report.mongodb.js',
      connection: local.id,
      database: 'shop',
      text: 'a = 1',
    });
    expect(found.danger).toEqual({ kind: 'none' });
  });

  it('writes a playground with a file without a question', () => {
    const found = planOf(plan(contextOf('playground.save', onFile('a = 2', 'a = 1')), {}));
    expect(found.steps[0]).toMatchObject({ kind: 'file', path: saved });
  });

  it('does nothing for a file without changes', () => {
    expect(planOf(plan(contextOf('playground.save', onFile('a = 1', 'a = 1')), {})).steps).toEqual([]);
  });

  it("asks for a second file with Save as…, offering the file's own name", () => {
    expect(plan(contextOf('playground.save', onFile('a = 1', 'a = 1')), { args: 'as' })).toEqual({
      kind: 'read',
      need: { key: 'file', read: 'playground.save:file', args: { name: 'report.mongodb.js' } },
    });
    const found = planOf(
      plan(contextOf('playground.save', onFile('a = 1', 'a = 1')), { args: 'as', file: 'C:/w/copy.js' }),
    );
    expect(found.title).toBe('Save playground as…');
    expect(found.steps[0]).toMatchObject({ path: 'C:/w/copy.js' });
  });

  it('saves nothing when the dialog is closed', () => {
    expect(planOf(plan(contextOf('playground.save', withPlayground('a = 1')), { file: null })).steps).toEqual([]);
  });

  it('keeps an extension that was typed, and says why a save failed', () => {
    expect(withExtension('C:/w/report.js')).toBe('C:/w/report.js');
    expect(withExtension('C:/w.d/report')).toBe('C:/w.d/report.mongodb.js');
    expect(saveFailedMessage('C:/w/report.mongodb.js', 'EACCES')).toBe('Could not save report.mongodb.js: EACCES');
  });
});
