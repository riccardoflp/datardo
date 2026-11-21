import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/structure/open-in-playground';
import { structureScript } from '../../../src/features/structure/script';
import type { AppStep } from '../../../src/shared/feature';
import { contextWith, dev, pageStart, planOf, production, workedExample } from './build';

const sides = { database: 'shop', left: 'Dev › shop', right: 'Production › shop' };

describe('structure.open-in-playground', () => {
  it('opens a new playground on Production and shop whose text is exactly the script', () => {
    const differences = workedExample();
    const planned = planOf(plan(contextWith('structure.open-in-playground'), pageStart(differences, { drops: true })));
    expect(planned.steps).toEqual([
      {
        kind: 'app',
        text: 'open a playground on Production › shop with the script that makes it like Dev › shop',
        action: 'playground.open',
        args: {
          connection: 'c-prod',
          database: 'shop',
          title: 'Playground 1',
          text: structureScript(differences, { ...sides, drops: true }),
          caret: 'start',
        },
      },
    ]);
  });

  it('sends nothing to the right database, and opens a playground each time', () => {
    const context = contextWith('structure.open-in-playground');
    const first = planOf(plan(context, pageStart(workedExample())));
    const second = planOf(plan(context, pageStart(workedExample())));
    expect([...first.steps, ...second.steps].every((step) => step.kind === 'app')).toBe(true);
    expect(second.steps).toEqual(first.steps);
    expect(first.danger).toEqual({ kind: 'none' });
  });

  it('opens on a read-only right connection, with the drops commented out', () => {
    const planned = planOf(
      plan(contextWith('structure.open-in-playground', [dev, production]), pageStart(workedExample())),
    );
    const text = ((planned.steps[0] as AppStep).args as { readonly text: string }).text;
    expect(text).toContain('// db.getCollection("legacy").drop();');
  });
});
