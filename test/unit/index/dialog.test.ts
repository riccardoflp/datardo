import { describe, expect, it } from 'vitest';
import {
  dialogAnswers,
  dialogDefinition,
  emptyForm,
  openDialog,
  switchedMode,
  view,
  withTtlTyped,
  type IndexDialogState,
  type IndexForm,
} from '../../../src/features/index/dialog';
import { inputOf, type IndexList } from '../../../src/features/index/types';
import { recordedList } from './harness';

function withRows(rows: readonly (readonly [string, string, string?])[], more: Partial<IndexForm> = {}): IndexForm {
  return { ...emptyForm, rows: rows.map(([field, type, weight]) => ({ field, type, weight: weight ?? '' })), ...more };
}

function creating(form: IndexForm, list?: IndexList): IndexDialogState {
  return { ...openDialog({ collection: 'orders', ...(list === undefined ? {} : { list }) }), form };
}

function withDocuments(documents: number): IndexList {
  return { indexes: [], totals: { documents } };
}

describe('index.dialog', () => {
  it('shows the createIndex command of the form and the generated name as the placeholder of Name', () => {
    const shown = view(
      creating(
        withRows(
          [
            ['status', '1'],
            ['createdAt', '-1'],
          ],
          { unique: true },
        ),
      ),
    );
    expect(shown.command).toBe(
      'db.getCollection("orders").createIndex({ status: 1, createdAt: -1 }, { unique: true })',
    );
    expect(shown.namePlaceholder).toBe('status_1_createdAt_-1');
    expect(shown.title).toBe('Create index · orders');
  });

  it('writes a TTL of 2 hours as 7200 seconds, and 90 seconds as 90', () => {
    const hours = withTtlTyped(withRows([['createdAt', '1']]), '2', 'hours');
    expect(view(creating(hours)).command).toContain('{ expireAfterSeconds: 7200 }');
    const seconds = withTtlTyped(withRows([['createdAt', '1']]), '90', 'seconds');
    expect(view(creating(seconds)).command).toContain('{ expireAfterSeconds: 90 }');
  });

  it('ticks TTL when a number is typed in it', () => {
    expect(emptyForm.ttl.on).toBe(false);
    expect(withTtlTyped(emptyForm, '3').ttl).toEqual({ on: true, value: '3', unit: 'days' });
  });

  it('shows the form in Text and back, and keeps keys the form cannot show in Text', () => {
    const state = creating(withRows([['status', '1']], { sparse: true }));
    const text = switchedMode(state, 'text');
    expect([text.mode, text.keys.text, text.options.text]).toEqual(['text', '{ status: 1 }', '{ sparse: true }']);
    expect(switchedMode(text, 'form').form.rows[0]).toEqual({ field: 'status', type: '1', weight: '' });
    const nested = { ...text, keys: inputOf('{ a: { b: 1 } }', { a: { b: 1 } }) };
    const stays = switchedMode(nested, 'form');
    expect(stays.mode).toBe('text');
    expect(stays.error).toBe(
      'These keys can only be edited as text: the form takes a direction (1, -1) or an index type for each field.',
    );
    expect(openDialog({ collection: 'orders', definition: { keys: { a: { b: 1 } }, options: {} } }).mode).toBe('text');
  });

  it('refuses a field listed twice, and nothing is sent', () => {
    const state = creating(
      withRows([
        ['status', '1'],
        ['status', '-1'],
      ]),
    );
    expect(dialogDefinition(state)).toEqual({ kind: 'error', message: 'The field status is listed twice.' });
    expect(dialogAnswers(state)).toBeUndefined();
  });

  it('refuses a weight of 0 or 1.5 on a text field', () => {
    for (const weight of ['0', '1.5']) {
      const state = creating(withRows([['title', 'text', weight]]));
      expect(dialogDefinition(state)).toEqual({
        kind: 'error',
        message: 'The weight of title must be a whole number from 1.',
      });
    }
  });

  it('says that the build reads the documents from 100,000 documents, not under', () => {
    const form = withRows([['status', '1']]);
    expect(view(creating(form, withDocuments(99_999))).note).toBeUndefined();
    expect(view(creating(form, withDocuments(100_000))).note).toBe(
      'The build reads the 100,000 documents of the collection: it can take a while and loads the server.',
    );
  });

  it('disables the main button, which Ctrl+Enter presses, while editing with No changes yet', () => {
    const list = recordedList();
    const email = list.indexes.find((index) => index.name === 'email_1');
    const definition = { keys: email?.key ?? {}, options: { unique: true } };
    const state = openDialog({ collection: 'orders', editing: { name: 'email_1', definition }, list });
    expect(view(state).main).toEqual({ label: 'Save changes', enabled: false });
    expect(view(state).note).toBe('No changes yet.');
    const hidden = { ...state, form: { ...state.form, hidden: true } };
    expect(view(hidden).main.enabled).toBe(true);
    expect(view(hidden).note).toBe('Applied to the existing index: nothing is built again.');
  });

  it('becomes Close while the index is built, leaving the build running', () => {
    const busy = { ...creating(withRows([['status', '1']])), busy: true };
    expect(view(busy).cancel).toEqual({
      label: 'Close',
      hint: 'The index keeps being built: the Indexes section shows when it is done',
    });
    expect(view(busy).main).toEqual({ label: 'Creating…', enabled: false });
    expect(view(busy).locked).toBe(true);
  });
});
