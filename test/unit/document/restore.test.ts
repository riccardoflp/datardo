/**
 * Restoring a version of the document history of `_id` 7 of `shop.orders` on Local: replacing the document with it,
 * or inserting it again when the document was deleted.
 */
import { describe, expect, it } from 'vitest';
import { afterReplies, plan } from '../../../src/features/document/restore-version';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers } from '../../../src/shared/feature';
import {
  contextOn,
  double,
  int,
  local,
  long,
  planOf,
  production,
  recorded,
  refusalOf,
  sentArguments,
  started,
  stepTexts,
} from './context';

const at = '2026-11-17 10:00';
const version = { _id: int(7), status: 'new', qty: int(3), price: double('5.5'), big: long('7') };
const context = contextOn('document.restore-version', { collection: 'orders' });

/** The answers of a restore of `version`, with the document as it is now (`null` once deleted). */
function restoring(current: Json | null, more: Readonly<Record<string, Json>> = {}): Answers {
  return started({ id: int(7), version, at, exact: true, ...more }, { current });
}

describe('document.restore-version', () => {
  it('asks Restore 7 as of …? with 2 fields differ., replaceOne with the version, and keeps the document', () => {
    const now = { _id: int(7), status: 'paid', qty: int(4), price: double('5.5'), big: long('7') };
    const restored = planOf(plan(context, restoring(now)));
    expect(restored.danger).toEqual({
      kind: 'confirm',
      text: `Restore 7 as of ${at}?\nIt replaces the document as it is now in shop.orders: 2 fields differ.`,
      button: 'Restore',
    });
    expect(stepTexts(restored)).toEqual([
      'db.orders.replaceOne({ _id: 7 }, { _id: 7, status: "new", qty: 3, price: 5.5, big: Long("7") })',
    ]);
    expect(sentArguments(restored)[1]).toEqual(version);
    expect(restored.undo).toMatchObject({ keeps: { kind: 'ids', ids: [int(7)], count: 1 } });
    expect(restored.title).toBe(`Restore 7 as of ${at}`);
    expect(restored.publishes).toBe(true);
  });

  it('reads the document as it is now before the confirmation', () => {
    expect(plan(context, started({ id: int(7), version, at, exact: true }))).toMatchObject({
      kind: 'read',
      need: { key: 'current', read: 'document.read', args: { id: int(7) } },
    });
  });

  it('runs insertOne with the version and its _id on a deleted document', () => {
    const inserted = planOf(plan(context, restoring(null)));
    expect(inserted.danger).toEqual({
      kind: 'confirm',
      text: `Insert 7 as of ${at} again?\nThe document was deleted: it is inserted again in shop.orders.`,
      button: 'Insert again',
    });
    expect(sentArguments(inserted)).toEqual([version]);
    expect(inserted.undo).toMatchObject({ keeps: { kind: 'inserted', ids: [int(7)] } });
  });

  it('refuses a partial version', () => {
    expect(refusalOf(plan(context, restoring(version, { exact: false })))).toEqual({
      code: 'document.restore-version/partial',
      message: 'Only a version whose fields are all known can be restored.',
    });
  });

  it('says the document is already as it was when it differs only in the order of its fields', () => {
    const reordered = { big: long('7'), price: double('5.5'), qty: int(3), status: 'new', _id: int(7) };
    expect(refusalOf(plan(context, restoring(reordered)))).toEqual({
      code: 'document.restore-version/same',
      message: 'The document is already as it was in this version.',
    });
  });

  it('is refused on a read-only connection, and when the connection no longer exists', () => {
    const readOnly = contextOn('document.restore-version', { collection: 'orders', connection: production });
    expect(refusalOf(plan(readOnly, restoring(version)))).toEqual({
      code: 'document.restore-version/read-only',
      message: 'The connection Production is read-only: nothing can be restored through it.',
    });
    const gone = started({ id: int(7), version, at, connection: 'c-gone', database: 'shop', collection: 'orders' });
    expect(refusalOf(plan(context, gone))).toEqual({
      code: 'document.restore-version/not-connected',
      message: 'The connection no longer exists.',
    });
  });

  it('says Restored, Inserted again, or that the document was deleted meanwhile, from the reply', () => {
    const answers = restoring(version);
    expect(afterReplies(context, answers, [recorded('replaceOne')])).toEqual({
      kind: 'after',
      after: [
        { kind: 'notify', level: 'success', text: `Restored 7 as of ${at}.` },
        { kind: 'refresh', connection: local.id },
      ],
    });
    expect(afterReplies(context, answers, [recorded('insertOne')])).toMatchObject({
      after: [{ text: `Inserted 7 as of ${at} again.` }, {}],
    });
    expect(afterReplies(context, answers, [recorded('updateOne-changed-again')])).toMatchObject({
      after: [
        { level: 'error', text: 'Restore failed: The document was deleted meanwhile: restore again to insert it.' },
        {},
      ],
    });
  });
});
