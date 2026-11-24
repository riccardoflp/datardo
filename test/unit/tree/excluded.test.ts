import { describe, expect, it } from 'vitest';
import {
  droppedExclusions,
  exclusionOf,
  renamedExclusions,
  withExclusions,
  type ExclusionTarget,
} from '../../../src/features/tree/excluded';
import { exclusionsOf } from '../../../src/shared/exclusion';

/** The connection of the worked examples. */
const connection = { excluded: true, exclusions: ['archive', 'media.fs.files', 'shop.logs'] } as const;

describe('tree.excluded', () => {
  it('gives the worked examples', () => {
    const examples: readonly (readonly [ExclusionTarget, string])[] = [
      [{ kind: 'connection' }, 'own'],
      [{ kind: 'database', database: 'archive' }, 'own'],
      [{ kind: 'collection', database: 'archive', collection: 'old' }, 'with-database'],
      [{ kind: 'collection', database: 'shop', collection: 'logs' }, 'own'],
      [{ kind: 'collection', database: 'shop', collection: 'orders' }, 'not-excluded'],
      [{ kind: 'database', database: 'shop' }, 'not-excluded'],
      [{ kind: 'bucket', database: 'media', bucket: 'fs' }, 'own'],
      [{ kind: 'collection', database: 'media', collection: 'fs.files' }, 'own'],
      [{ kind: 'collection', database: 'media', collection: 'fs.chunks' }, 'not-excluded'],
    ];
    for (const [target, result] of examples) {
      expect(exclusionOf(connection, target), JSON.stringify(target)).toBe(result);
    }
    expect(exclusionOf({}, { kind: 'connection' })).toBe('not-excluded');
  });

  it('adds and removes keys, sorted, and gives nothing when the list is left empty', () => {
    expect(withExclusions(['shop.logs'], ['archive', 'shop.logs'], true)).toEqual(['archive', 'shop.logs']);
    expect(withExclusions(['shop.logs'], ['shop.logs'], false)).toBeUndefined();
    const list = ['shop.logs'];
    expect(withExclusions(list, ['shop.logs'], true)).toBe(list);
  });

  it('moves the key of a renamed collection', () => {
    expect(renamedExclusions(connection.exclusions, 'shop', 'logs', 'logs_old')).toEqual([
      'archive',
      'media.fs.files',
      'shop.logs_old',
    ]);
    expect(renamedExclusions(connection.exclusions, 'shop', 'users', 'clients')).toBe(connection.exclusions);
  });

  it('forgets the keys of a dropped database, bucket or collection', () => {
    expect(
      droppedExclusions(['archive', 'archive.old', 'shop.logs'], { kind: 'database', database: 'archive' }),
    ).toEqual(['shop.logs']);
    expect(
      droppedExclusions(['media.fs.chunks', 'media.fs.files', 'media.photos.files'], {
        kind: 'bucket',
        database: 'media',
        bucket: 'fs',
      }),
    ).toEqual(['media.photos.files']);
    expect(
      droppedExclusions(['shop.logs'], { kind: 'collection', database: 'shop', collection: 'logs' }),
    ).toBeUndefined();
  });

  it('reads only the keys of databases and collections, sorted and without repeats', () => {
    expect(exclusionsOf(['shop.logs', 3, 'shop.logs', '.x', 'archive'])).toEqual(['archive', 'shop.logs']);
    expect(exclusionsOf('archive')).toBeUndefined();
    expect(exclusionsOf([])).toBeUndefined();
  });
});
