import { describe, expect, it } from 'vitest';
import { editableDefinition } from '../../../src/features/index/change-plan';
import { indexCommand, searchIndexCommand } from '../../../src/features/index/command';
import { textDefinition } from '../../../src/features/index/dialog';
import { inputOf } from '../../../src/features/index/types';
import { recordedList } from './harness';

describe('index.command', () => {
  it('gives the command of each input of the examples', () => {
    expect(indexCommand('orders', { keys: { status: 1, createdAt: -1 }, options: { unique: true } })).toBe(
      'db.getCollection("orders").createIndex({ status: 1, createdAt: -1 }, { unique: true })',
    );
    expect(indexCommand('orders', { keys: { status: 1 }, options: { unique: false, name: 'status_1' } })).toBe(
      'db.getCollection("orders").createIndex({ status: 1 })',
    );
    expect(indexCommand('orders', { keys: { status: 1 }, options: { name: 'byStatus' } })).toBe(
      'db.getCollection("orders").createIndex({ status: 1 }, { name: "byStatus" })',
    );
    expect(indexCommand('my "odd" name', { keys: { a: 1 }, options: {} })).toBe(
      'db.getCollection("my \\"odd\\" name").createIndex({ a: 1 })',
    );
    const dynamic = { mappings: { dynamic: true } };
    expect(searchIndexCommand('movies', { name: 'default', type: 'search', definition: dynamic })).toBe(
      'db.getCollection("movies").createSearchIndex("default", { mappings: { dynamic: true } })',
    );
    expect(
      searchIndexCommand('movies', { name: 'vector_index', type: 'vectorSearch', definition: { fields: [] } }),
    ).toBe('db.getCollection("movies").createSearchIndex("vector_index", "vectorSearch", { fields: [] })');
    expect(searchIndexCommand('movies', { name: 'titles', type: 'search', definition: dynamic, update: true })).toBe(
      'db.getCollection("movies").updateSearchIndex("titles", { mappings: { dynamic: true } })',
    );
  });

  it('gives back the same keys and options when the command is read again', () => {
    for (const index of recordedList().indexes) {
      const definition = editableDefinition(index.name, index.key, index.options);
      const command = indexCommand('orders', definition);
      const args = /createIndex\((.*)\)$/u.exec(command)?.[1] ?? '';
      expect(args.startsWith('{')).toBe(true);
      // The keys and options as the command writes them, read back as the dialog's Text reads them.
      const read = textDefinition(inputOf('', definition.keys), inputOf('', definition.options));
      expect(read).toEqual({ kind: 'definition', definition });
    }
  });
});
