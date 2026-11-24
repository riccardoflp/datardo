/**
 * The step that follows a drop made from Datardo when the dropped collection has a color, an exclusion from searches
 * and formatting rules at once (M38, M39 and M41 together): one step names the three.
 */
import { describe, expect, it } from 'vitest';
import { withCollectionRules } from '../../../src/features/table/format-scopes';
import { forgetStep } from '../../../src/features/tree/parts/forget-step';
import { noFormatting } from '../../../src/shared/formatting-rules';
import { connectionId } from '../../../src/shared/ids';

const id = connectionId('c-local');
const connection = {
  id,
  databaseColors: {},
  collectionColors: { 'shop.logs': 'teal' as const },
  exclusions: ['shop.logs'],
};
const formatting = withCollectionRules(noFormatting, { connection: 'c-local', database: 'shop', collection: 'logs' }, [
  { id: 'r1', condition: '{ level: "error" }', color: 'red' },
]);

describe('manage.drop-collection', () => {
  it('forgets the color, the exclusion from searches and the formatting rules of shop.logs in one step', () => {
    const steps = forgetStep(connection, { kind: 'collection', database: 'shop', collection: 'logs' }, formatting);
    expect(steps.map((step) => step.text)).toEqual([
      'forget the color, the exclusion from searches and the formatting rules of shop.logs',
    ]);
  });
});
