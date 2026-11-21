/**
 * What the window gives the features of values: the arguments of an intent under `answers.args`, the form of
 * **Add field** with the format of each answer, the undo that keeps the key, the order of the rows of a table, and the
 * commands of values offered in a key tab.
 */
import { describe, expect, it } from 'vitest';
import { offeredCommands, targetNow } from '../../../src/features/palette/run-command';
import { keyNameOf } from '../../../src/features/undo/types';
import * as addField from '../../../src/features/value/add-field';
import { commands } from '../../../src/features/value/commands';
import { features } from '../../../src/features/value';
import { rowName, sortedRows, type ValueRow } from '../../../src/features/value/show';
import { hexOf, keyKept, withArgs } from '../../../src/features/value/types';
import type { OperationFeature } from '../../../src/shared/feature';
import { initialState, type AppState } from '../../../src/shared/state';
import { keyContext, planOf, readAnswers, stepTexts, utf8 } from './context';

function operation(id: string): OperationFeature {
  const found = features.find((feature) => feature.id === id);
  if (found?.kind !== 'operation') {
    throw new Error(`${id} is not an operation`);
  }
  return found;
}

describe('value.save-string', () => {
  it('reads what the window sends under args: the value typed and the bytes loaded', () => {
    const context = keyContext('value.save-string', { key: 'orders:42' });
    const args = { loaded: { hex: hexOf(utf8('hello')) }, value: { text: 'hello world', format: 'text' } };
    const outcome = operation('value.save-string').plan(context, { args, ...readAnswers('string', [utf8('hello')]) });
    expect(stepTexts(outcome)).toEqual(['SET orders:42 "hello world" KEEPTTL']);
  });

  it('keeps the key for its undo, as the undo history keeps keys of Redis', () => {
    expect(
      keyKept({ connection: keyContext('x').state.connections.saved[0]!.id, database: 3, key: utf8('a') }),
    ).toEqual({
      keeps: { kind: 'keys', database: 3, keys: [keyNameOf(utf8('a'))] },
    });
  });

  it('lets the answers of the runner win over the arguments of the intent', () => {
    expect(withArgs({ args: { value: 'typed', check: 'x' }, value: 'answered' })).toMatchObject({ value: 'answered' });
    expect(withArgs({ args: { value: 'typed', check: 'x' } })).not.toHaveProperty('check');
  });
});

describe('value.add-field', () => {
  const context = keyContext('value.add-field');

  it('asks for the field and the value, each with Text, JSON and Hex', () => {
    const outcome = addField.plan(context, {});
    const fields = outcome.kind === 'ask' ? outcome.question.fields : [];
    expect(fields.map((field) => field.label)).toEqual(['Field', 'Field as', 'Value', 'Value as']);
  });

  it('sends a field typed in Hex as its bytes', () => {
    const answers = { field: '00 ff', fieldFormat: 'hex', value: 'Ada', valueFormat: 'text' };
    const outcome = addField.plan(context, { ...answers, ...readAnswers('hash', [0]) });
    expect(stepTexts(outcome)).toEqual(['HSET user:7 "\\x00\\xff" Ada']);
    expect(planOf(outcome).title).toBe('Add field \\x00\\xff to user:7');
  });
});

describe('value.show', () => {
  const rows: readonly ValueRow[] = [
    { cells: { Field: utf8('b'), Value: utf8('2') } },
    { cells: { Field: utf8('a'), Value: utf8('3') } },
    { cells: { Field: utf8('c'), Value: utf8('1') } },
  ];

  it('sorts the loaded rows of a hash by a column, lowest first or highest first', () => {
    const names = (sorted: readonly ValueRow[]): readonly string[] => sorted.map((row) => hexOf(rowName(row)));
    expect(names(sortedRows('hash', rows, { column: 'Field', order: 'ascending' }))).toEqual(['61', '62', '63']);
    expect(names(sortedRows('hash', rows, { column: 'Value', order: 'descending' }))).toEqual(['61', '62', '63']);
  });

  it('keeps the order of a list, and knows a row by its field, member, index or entry', () => {
    expect(sortedRows('list', rows, { column: 'Field', order: 'ascending' })).toBe(rows);
    expect(rowName({ cells: { Index: '4', Element: utf8('x') } })).toEqual(utf8('4'));
    expect(rowName({ cells: {}, entry: { id: '1-0', fields: [] } })).toEqual(utf8('1-0'));
  });
});

describe('value.refresh', () => {
  function inKeyTab(): AppState {
    const context = keyContext('value.refresh');
    const tab = {
      id: 't1',
      title: 'user:7',
      shows: { kind: 'key', connection: context.state.connections.saved[0]!.id, database: 2, key: 'user:7' },
      lastActive: 1,
    };
    return {
      ...context.state,
      nav: { ...initialState.nav, current: context.state.connections.saved[0]!.id },
      tabs: { ...initialState.tabs, tabs: [tab], active: 't1' },
    } as unknown as AppState;
  }

  it('is offered in a key tab, on the key the tab shows, and not elsewhere', () => {
    const state = inKeyTab();
    const ids = offeredCommands(commands, state, 'windows').map((entry) => entry.id);
    expect(ids).toContain('value.refresh');
    expect(targetNow(state, 'value.refresh')).toMatchObject({ kind: 'key', database: 2, key: utf8('user:7') });
    expect(offeredCommands(commands, initialState, 'windows').map((entry) => entry.id)).not.toContain('value.refresh');
  });
});
