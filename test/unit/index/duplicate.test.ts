import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/index/create';
import { dialogAnswers, view as dialogView } from '../../../src/features/index/dialog';
import { view } from '../../../src/features/index/duplicate';
import type { IndexInfo } from '../../../src/features/index/types';
import { contextOn, notices, planOf, recordedIndex, recordedList, started } from './harness';

const byEmail: IndexInfo = { name: 'byEmail', key: { email: 1 }, options: { v: 2, unique: true }, building: false };

describe('index.duplicate', () => {
  it('opens Create index · users with email, Unique ticked and an empty Name whose placeholder is email_1', () => {
    const state = view({ collection: 'users', index: byEmail });
    const shown = dialogView(state);
    expect(shown.title).toBe('Create index · users');
    expect(state.form.rows).toEqual([{ field: 'email', type: '1', weight: '' }]);
    expect(state.form.unique).toBe(true);
    expect(state.form.name).toBe('');
    expect(shown.namePlaceholder).toBe('email_1');
  });

  it('opens a text index with two text fields and the weight 3 on body', () => {
    const state = view({ collection: 'orders', index: recordedIndex('title_text_body_text') });
    // getIndexes reports the fields of a text index in its weights, by name: their order says nothing.
    expect(state.form.rows).toHaveLength(2);
    expect(state.form.rows).toContainEqual({ field: 'title', type: 'text', weight: '' });
    expect(state.form.rows).toContainEqual({ field: 'body', type: 'text', weight: '3' });
  });

  it('creates nothing when the copy is saved unchanged under the generated name', () => {
    const list = recordedList();
    const state = view({ collection: 'orders', index: recordedIndex('email_1'), list });
    const answers = dialogAnswers(state) ?? {};
    const shown = planOf(plan(contextOn(false, 'index.create'), { ...started(), indexes: list, ...answers }));
    expect(shown.steps).toEqual([]);
    expect(notices(shown)).toEqual(['An identical index already exists: nothing was created.']);
  });
});
