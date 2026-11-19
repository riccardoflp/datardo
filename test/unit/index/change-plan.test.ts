import { describe, expect, it } from 'vitest';
import {
  editableDefinition,
  generatedName,
  indexChange,
  stable,
  ttlParts,
  ttlSeconds,
} from '../../../src/features/index/change-plan';
import { dialogNote, openDialog } from '../../../src/features/index/dialog';
import type { IndexDefinition, JsonDocument } from '../../../src/features/index/types';
import { recordedList } from './harness';

function index(keys: JsonDocument, options: JsonDocument = {}): IndexDefinition {
  return { keys, options };
}

describe('index.change-plan', () => {
  it('gives the results of the worked examples', () => {
    const rows: readonly (readonly [IndexDefinition, IndexDefinition, unknown])[] = [
      [
        index({ a: 1 }, { collation: { locale: 'fr', strength: 1 } }),
        index({ a: 1 }, { collation: { strength: 1, locale: 'fr' } }),
        { kind: 'none' },
      ],
      [index({ a: 1, b: 1 }), index({ b: 1, a: 1 }), { kind: 'recreate', changed: ['keys', 'name'] }],
      [index({ a: 1 }), index({ a: 1 }, { hidden: true }), { kind: 'modify', hidden: true }],
      [index({ a: 1 }, { hidden: true }), index({ a: 1 }), { kind: 'modify', hidden: false }],
      [
        index({ a: 1 }, { expireAfterSeconds: 60 }),
        index({ a: 1 }, { expireAfterSeconds: 120, hidden: true }),
        { kind: 'modify', hidden: true, expireAfterSeconds: 120 },
      ],
      [
        index({ a: 1 }),
        index({ a: 1 }, { expireAfterSeconds: 60 }),
        { kind: 'recreate', changed: ['expireAfterSeconds'] },
      ],
      [
        index({ a: 1 }, { expireAfterSeconds: 60 }),
        index({ a: 1 }),
        { kind: 'recreate', changed: ['expireAfterSeconds'] },
      ],
      [
        index({ a: 1 }),
        index({ a: 1 }, { unique: true, hidden: true }),
        { kind: 'recreate', changed: ['unique', 'hidden'] },
      ],
      [index({ a: 1 }), index({ a: 1 }, { name: 'renamed' }), { kind: 'recreate', changed: ['name'] }],
      [
        editableDefinition('a_1', { a: 1 }, { v: 2, expireAfterSeconds: 60 }),
        index({ a: 1 }, { expireAfterSeconds: 60, unique: false }),
        { kind: 'none' },
      ],
    ];
    for (const [current, next, result] of rows) {
      expect(indexChange(current, next)).toEqual(result);
    }
    expect(generatedName({ a: 1, 'b.c': -1 })).toBe('a_1_b.c_-1');
    expect(generatedName({ loc: '2dsphere', name: 'text' })).toBe('loc_2dsphere_name_text');
    expect([86_400, 7200, 90, 0].map(ttlParts)).toEqual([
      { value: 1, unit: 'days' },
      { value: 2, unit: 'hours' },
      { value: 90, unit: 'seconds' },
      { value: 0, unit: 'seconds' },
    ]);
    expect(ttlSeconds(2, 'hours')).toBe(7200);
    const text = editableDefinition(
      'cat_1_title_text_body_text',
      { cat: 1, _fts: 'text', _ftsx: 1 },
      {
        weights: { title: 1, body: 3 },
        default_language: 'english',
        language_override: 'language',
        textIndexVersion: 3,
      },
    );
    expect(text).toEqual({ keys: { cat: 1, title: 'text', body: 'text' }, options: { weights: { body: 3 } } });
  });

  it('finds no change in an index read back from getIndexes and saved unchanged: No changes yet.', () => {
    const list = recordedList();
    for (const each of list.indexes) {
      const definition = editableDefinition(each.name, each.key, each.options);
      expect(indexChange(definition, definition)).toEqual({ kind: 'none' });
      const state = openDialog({ collection: 'orders', definition, editing: { name: each.name, definition }, list });
      expect(dialogNote(state, definition)).toBe('No changes yet.');
    }
  });

  it('never minds the order of the options, always the order of the keys', () => {
    const options = { unique: true, partialFilterExpression: { a: 1, b: 2 } };
    const reordered = { partialFilterExpression: { b: 2, a: 1 }, unique: true };
    expect(indexChange(index({ x: 1, y: 1 }, options), index({ x: 1, y: 1 }, reordered))).toEqual({ kind: 'none' });
    expect(stable({ b: 1, a: 2 })).toBe(stable({ a: 2, b: 1 }));
    expect(indexChange(index({ x: 1, y: 1 }), index({ y: 1, x: 1 }, { name: 'x_1_y_1' })).kind).toBe('recreate');
  });
});
