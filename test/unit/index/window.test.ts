/**
 * What the window of the index area decides with pure functions: the question the dialogs are drawn from, what a text
 * typed in their editors reads as, what becomes of a dialog once its plan has ended (it closes, or opens again with the
 * server's error), the commands Go to offers, and **Indexes** from the tree's menu.
 */
import { describe, expect, it } from 'vitest';
import { isOffered } from '../../../src/features/index/commands';
import { indexCommand } from '../../../src/features/index/command';
import {
  dialogAboutOf,
  dialogOfQuestion,
  dialogQuestion,
  searchDialogAboutOf,
} from '../../../src/features/index/parts/dialog-question';
import { dialogOutcome, failuresSince, type EditedIndex } from '../../../src/features/index/parts/dialog-outcome';
import { typedInput } from '../../../src/features/index/parts/typed-input';
import { searchDialogQuestion } from '../../../src/features/index/search-dialog';
import { plan, view } from '../../../src/features/index/show';
import { text } from '../../../src/features/index/text';
import { isOffered as isOfferedInGoTo } from '../../../src/features/palette/run-command';
import { tabId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import { mongoConnection, stateWith } from '../connection/context';
import { contextOn, planOf, started } from './harness';

const where = { connection: 'c-local', database: 'shop', collection: 'orders' };

describe('index.dialog', () => {
  it('is asked with the collection, the definition and the indexes the window draws it from', () => {
    const definition = { keys: { status: 1 }, options: { unique: true } };
    const question = dialogQuestion(text.create.title('orders'), text.create.button, definition, {
      ...where,
      definition,
    });
    expect(question.element).toBe('index.dialog@dialog');
    const about = dialogAboutOf(question);
    expect(about).toEqual({ ...where, definition });
    const opened = dialogOfQuestion(about ?? where);
    expect(opened.mode).toBe('form');
    expect(opened.form.rows).toEqual([{ field: 'status', type: '1', weight: '' }]);
    expect(opened.form.unique).toBe(true);
    expect(opened.editing).toBeUndefined();
  });

  it('opens on the index being changed, and in Text for keys the form cannot show', () => {
    const definition = { keys: { a: { b: 1 } }, options: {} };
    const opened = dialogOfQuestion({ ...where, definition, editing: 'a_b' });
    expect(opened.editing).toEqual({ name: 'a_b', definition });
    expect(opened.mode).toBe('text');
  });

  it('is not drawn for a question of another dialog', () => {
    const other = { ...dialogQuestion('t', 'b', undefined, where), element: 'runner.ask@dialog' };
    expect(dialogAboutOf(other)).toBeUndefined();
    expect(dialogAboutOf(dialogQuestion('t', 'b'))).toBeUndefined();
  });

  it('reads a text typed in mongosh syntax with its numbers written plainly', () => {
    expect(typedInput('  ', 0).parsed).toEqual({ kind: 'empty' });
    expect(typedInput('{ a: NumberInt(1), b: -1 }', 0).parsed).toEqual({ kind: 'value', value: { a: 1, b: -1 } });
    expect(typedInput('{ a: ', 0).parsed.kind).toBe('invalid');
  });
});

describe('index.search-dialog', () => {
  it('is asked with the collection and the index being changed', () => {
    const editing = { name: 'titles', type: 'search' as const, definition: { mappings: { dynamic: true } } };
    const question = searchDialogQuestion('t', 'b', editing, where);
    expect(question.element).toBe('index.search-dialog@dialog');
    expect(searchDialogAboutOf(question)).toEqual({ ...where, editing });
    expect(searchDialogAboutOf(searchDialogQuestion('t', 'b'))).toBeUndefined();
  });
});

describe('index.create', () => {
  const end = (kind: 'done' | 'cancelled') => ({ kind });

  it('closes the dialog once the index is created', () => {
    expect(dialogOutcome({ feature: 'index.create', end: end('done'), failures: [] })).toEqual({ kind: 'closed' });
  });

  it('opens the dialog again, without an error, when its plan was cancelled', () => {
    expect(dialogOutcome({ feature: 'index.create', end: end('cancelled'), failures: [] })).toEqual({ kind: 'again' });
  });

  it("opens the dialog again with the server's error, which stays open", () => {
    const error = 'E11000 duplicate key error collection: shop.orders index: email_1 dup key: { email: "a@b.c" }';
    const ended = { feature: 'index.create', end: { kind: 'failed' as const, message: 'failed' }, failures: [error] };
    expect(dialogOutcome(ended)).toEqual({ kind: 'again', error });
    const refused = { kind: 'refused' as const, message: text.readOnly('Production') };
    expect(dialogOutcome({ feature: 'index.create', end: refused, failures: [] })).toEqual({
      kind: 'again',
      error: text.readOnly('Production'),
    });
  });

  it('reads the errors the Log wrote for the feature while its plan ran', () => {
    const lines = [
      { id: 3, source: 'index.create', kind: 'error', text: '[index.create] failed: old' },
      { id: 5, source: 'index.drop', kind: 'error', text: '[index.drop] failed: other' },
      { id: 6, source: 'index.create', kind: 'info', text: 'Created index a_1.' },
      { id: 7, source: 'index.create', kind: 'error', text: '[index.create] failed: Index build failed' },
    ];
    expect(failuresSince(lines, 'index.create', 4)).toEqual(['Index build failed']);
  });
});

describe('index.edit', () => {
  const current = { keys: { email: 1 }, options: { name: 'email_1' } };
  const edited: EditedIndex = {
    collection: 'users',
    name: 'email_1',
    current,
    next: { keys: { email: 1 }, options: { name: 'email_1', unique: true } },
  };
  const duplicates = 'E11000 duplicate key error collection: shop.users index: email_1 dup key: { email: "a@b.c" }';

  it('opens the dialog again with the error and the index created again as it was', () => {
    const outcome = dialogOutcome({ feature: 'index.edit', end: { kind: 'done' }, failures: [duplicates], edited });
    expect(outcome).toEqual({ kind: 'again', error: `${duplicates}\n${text.edit.restored('email_1')}` });
  });

  it('gives the definition of an index that could not be created again', () => {
    const failures = [duplicates, 'connection closed'];
    const outcome = dialogOutcome({
      feature: 'index.edit',
      end: { kind: 'failed', message: 'connection closed' },
      failures,
      edited,
    });
    expect(outcome).toEqual({
      kind: 'again',
      error: `${duplicates}\n${text.edit.notRestored('email_1', 'connection closed')}\n${indexCommand('users', current)}`,
    });
  });

  it('closes the dialog when the two indexes could not be side by side and the change was then made', () => {
    const renamed: EditedIndex = {
      ...edited,
      next: { keys: { email: 1 }, options: { name: 'byEmail', unique: true } },
    };
    const sideBySide = 'Index already exists with a different name: email_1';
    const outcome = dialogOutcome({
      feature: 'index.edit',
      end: { kind: 'done' },
      failures: [sideBySide],
      edited: renamed,
    });
    expect(outcome).toEqual({ kind: 'closed' });
  });
});

function stateOn(readOnly: boolean, section?: string, view = false): AppState {
  const local = mongoConnection({ readOnly });
  const base = stateWith([local], { [local.id]: 'connected' });
  const tab = {
    id: tabId('t1'),
    shows: {
      kind: 'collection' as const,
      connection: local.id,
      database: 'shop',
      collection: 'orders',
      ...(view ? { view: true } : {}),
    },
    lastActive: 0,
    loaded: true,
    ...(section === undefined ? {} : { section }),
  };
  return { ...base, nav: { ...base.nav, current: local.id }, tabs: { ...base.tabs, tabs: [tab], active: tab.id } };
}

describe('index.show', () => {
  it('offers Indexes on a collection tab, the writes on a connection that is not read-only', () => {
    const documents = stateOn(false);
    expect(isOffered(documents, 'index.show')).toBe(true);
    expect(isOffered(documents, 'index.create')).toBe(true);
    expect(isOffered(documents, 'index.create-search')).toBe(true);
    expect(isOffered(documents, 'index.drop')).toBe(false);
    const indexes = stateOn(false, 'indexes');
    for (const id of ['index.edit', 'index.hide', 'index.drop', 'index.edit-search', 'index.drop-search']) {
      expect(isOffered(indexes, id)).toBe(true);
      expect(isOfferedInGoTo(indexes, id)).toBe(true);
    }
    const readOnly = stateOn(true, 'indexes');
    expect(isOffered(readOnly, 'index.show')).toBe(true);
    expect(isOffered(readOnly, 'index.create')).toBe(false);
    expect(isOffered(readOnly, 'index.drop')).toBe(false);
    expect(isOffered(stateOn(false, undefined, true), 'index.show')).toBe(false);
  });

  it("opens the collection's tab on its Indexes section from the tree's menu", () => {
    const shown = planOf(plan(contextOn(false, 'index.show'), started()));
    expect(shown.steps).toEqual([]);
    expect(shown.after).toEqual([
      {
        kind: 'start',
        feature: 'tab.open',
        target: { kind: 'connection', connection: 'c-local' },
        args: {
          shows: { kind: 'collection', connection: 'c-local', database: 'shop', collection: 'orders' },
          section: 'indexes',
        },
      },
    ]);
  });

  it('gives each line of the summary of a search index for its tooltip', () => {
    const index = {
      name: 'default',
      type: 'search',
      status: 'READY',
      queryable: true,
      definition: { mappings: { dynamic: true }, analyzer: 'lucene.english' },
    };
    const rows = view({
      collection: 'orders',
      readOnly: false,
      now: 0,
      shown: true,
      loading: false,
      changing: false,
      searchIndexes: { kind: 'indexes', indexes: [index] },
    }).search.rows;
    expect(rows[0]?.definitionLines).toEqual([text.summary.dynamic, text.summary.analyzer('lucene.english')]);
    expect(rows[0]?.definition).toBe(rows[0]?.definitionLines.join(' · '));
  });
});
