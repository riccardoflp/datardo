import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/structure/copy-script';
import { structureScript } from '../../../src/features/structure/script';
import { diffStructure } from '../../../src/features/structure/steps';
import type { AppStep } from '../../../src/shared/feature';
import {
  collection,
  contextWith,
  database,
  dev,
  differenceOf,
  pageStart,
  planOf,
  production,
  workedExample,
} from './build';

const context = contextWith('structure.copy-script');
const sides = { database: 'shop', left: 'Dev › shop', right: 'Production › shop' };

function copied(outcome: ReturnType<typeof plan>): { readonly step: AppStep; readonly text: string } {
  const step = planOf(outcome).steps[0] as AppStep;
  return { step, text: (step.args as { readonly text: string }).text };
}

describe('structure.copy-script', () => {
  it('copies the whole script, drops commented out or not as Include drops in the script says', () => {
    const differences = workedExample();
    const without = copied(plan(context, pageStart(differences)));
    expect(without.step).toMatchObject({
      kind: 'app',
      action: 'nav.copy',
      text: 'copy the script that makes Production › shop like Dev › shop to the clipboard',
    });
    expect(without.text).toBe(structureScript(differences, { ...sides, drops: false }));
    expect(without.text).toContain('// db.getCollection("legacy").drop();');
    const including = copied(plan(context, pageStart(differences, { drops: true })));
    expect(including.text).toBe(structureScript(differences, { ...sides, drops: true }));
    expect(including.text).toContain('\ndb.getCollection("legacy").drop();');
  });

  it('copies the steps of every difference, also of the rows the list hides', () => {
    const { text } = copied(plan(context, pageStart(workedExample(), { chosen: [] })));
    for (const command of [
      'createIndex({ status: 1 })',
      'collMod: "users"',
      'createView("big"',
      'dropIndex("old_1")',
    ]) {
      expect(text).toContain(command);
    }
  });

  it('copies the lines of one difference alone, ending with a new line', () => {
    const status = differenceOf(workedExample(), 'orders', 'index', 'status_1');
    const one = copied(plan(context, pageStart(workedExample(), { difference: status.id })));
    expect(one.step.text).toBe('copy the steps of orders index status_1 to the clipboard');
    expect(one.text).toBe('db.getCollection("orders").createIndex({ status: 1 });\n');
  });

  it('copies the script that says nothing is to change when the structures are the same', () => {
    const same = database([collection('orders')]);
    const { text } = copied(plan(context, pageStart(diffStructure(same, same).differences)));
    expect(text).toContain('// Nothing to change: the structures are the same.');
  });

  it('works on a read-only right connection, with no danger, and says it copied', () => {
    const planned = planOf(plan(contextWith('structure.copy-script', [dev, production]), pageStart(workedExample())));
    expect(planned.danger).toEqual({ kind: 'none' });
    expect(planned.steps).toHaveLength(1);
    expect(planned.after).toEqual([{ kind: 'notify', level: 'success', text: 'Copied to the clipboard' }]);
  });

  it('copies nothing without a comparison', () => {
    expect(planOf(plan(context, { args: {} })).steps).toEqual([]);
  });
});
