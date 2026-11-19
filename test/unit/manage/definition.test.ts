import { describe, expect, it } from 'vitest';
import { definitionText, plan, view, type DefinitionState } from '../../../src/features/manage/definition';
import { parse } from '../../../src/features/manage/read-options';
import { collectionTab, manageContext, planOf, questionOf, readOf, recordedOptions, started } from './harness';

const read = { kind: 'read', options: parse([recordedOptions('view')]) } as const;
const shown = '{\n  viewOn: "orders",\n  pipeline: [\n    { $match: { status: "paid" } }\n  ]\n}';
const state: DefinitionState = { database: 'shop', view: 'recent', readOnly: false, read };

describe('manage.definition', () => {
  it('shows viewOn and the pipeline, two-space indented', () => {
    expect(view(state).editor?.text).toBe(shown);
  });

  it('writes values in mongosh syntax', () => {
    const options = {
      viewOn: 'orders',
      pipeline: [
        { $match: { at: { $date: { $numberLong: '1704067200000' } }, by: { $oid: '65f1c0de9a7b4e00012f3a2c' } } },
      ],
    };
    expect(definitionText(options)).toBe(
      '{\n  viewOn: "orders",\n  pipeline: [\n' +
        '    { $match: { at: ISODate("2024-01-01T00:00:00.000Z"), by: ObjectId("65f1c0de9a7b4e00012f3a2c") } }\n  ]\n}',
    );
    expect(definitionText({ viewOn: 'orders' })).toBe('{\n  viewOn: "orders",\n  pipeline: []\n}');
  });

  it('enables Save only once a character of the text changes, and not after a save', () => {
    expect(view(state).toolbar.save).toEqual({
      label: 'Save',
      key: 'Ctrl+S',
      enabled: false,
      element: 'manage.edit-view@toolbar',
    });
    const typed = view({ ...state, typed: shown.replace('paid', 'new') });
    expect(typed.toolbar.save?.enabled).toBe(true);
    expect(typed.toolbar.discard).toEqual({ label: 'Discard changes', enabled: true });
    expect(typed.toolbar.reload.confirm).toEqual({
      title: 'Discard your changes to the definition of shop.recent?',
      button: 'Discard',
    });
    const options = { viewOn: 'orders', pipeline: [{ $match: { status: 'new' } }] };
    const reread = { kind: 'read', options: { kind: 'found', type: 'view', options } } as const;
    const afterSave = view({ ...state, read: reread, typed: shown.replace('paid', 'new') });
    expect(afterSave.toolbar.save?.enabled).toBe(false);
  });

  it('shows the text as typed, kept in the state while another section is shown', () => {
    const typed = shown.replace('paid', 'new');
    expect(view({ ...state, typed }).editor?.text).toBe(typed);
  });

  it('on a read-only connection, the editor is read-only and there is no Save', () => {
    const readOnly = view({ ...state, readOnly: true });
    expect(readOnly.editor?.readOnly).toBe(true);
    expect(readOnly.toolbar.save).toBeUndefined();
    expect(readOnly.toolbar.discard).toBeUndefined();
    expect(readOnly.statusLine).toBe('Read-only');
  });

  it('shows the message of a refused save until the text changes', () => {
    const typed = shown.replace('paid', 'new');
    const refused = { text: typed, message: 'Not applied: $out is not allowed in a view' };
    expect(view({ ...state, typed, refused }).refused).toBe('Not applied: $out is not allowed in a view');
    expect(view({ ...state, typed: `${typed} `, refused }).refused).toBeUndefined();
  });

  it('shows loading, the error with Reload, and a view that no longer exists', () => {
    expect(view({ ...state, read: { kind: 'loading' } })).toMatchObject({ state: 'loading' });
    expect(view({ ...state, read: { kind: 'error', message: 'not authorized' } })).toMatchObject({
      state: 'error',
      message: 'not authorized',
      toolbar: { reload: { label: 'Reload' } },
    });
    const gone = view({ ...state, read: { kind: 'read', options: parse([recordedOptions('missing')]) } });
    expect(gone).toMatchObject({ state: 'gone', message: 'The view shop.recent no longer exists.' });
  });

  it('opens the view tab on its Definition section', () => {
    const context = manageContext('manage.definition');
    const opened = planOf(plan(context, started({ database: 'shop', collection: 'recent' })));
    expect(opened.after).toEqual([
      {
        kind: 'start',
        feature: 'tab.open',
        target: { kind: 'connection', connection: 'c-local' },
        args: {
          shows: { kind: 'collection', connection: 'c-local', database: 'shop', collection: 'recent', view: true },
          section: 'definition',
        },
      },
    ]);
  });

  it('from Go to on a collection tab, asks to pick a view: a collection has no Definition section', () => {
    const context = manageContext('manage.definition', [collectionTab(1, 'orders')], { kind: 'app' });
    expect(readOf(plan(context, {}))).toMatchObject({ key: 'collections', read: 'tree.list-collections' });
    const collections = {
      buckets: [],
      entries: [
        { name: 'orders', kind: 'collection', system: false },
        { name: 'recent', kind: 'view', system: false },
      ],
    };
    const pick = questionOf(plan(context, { collections }));
    expect(pick.fields[0]).toMatchObject({ key: 'collection', choices: [{ value: 'recent' }] });
  });
});
