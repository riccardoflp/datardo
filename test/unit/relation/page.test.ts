import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/relation/diagram';
import { keptAfter, keptFor } from '../../../src/features/relation/kept/references';
import { diagramChoices, diagramOf, firstDiagram, keptDiagram } from '../../../src/features/relation/model/page';
import type { AppStep } from '../../../src/shared/feature';
import { tabId } from '../../../src/shared/ids';
import { initialRelationState, reduceRelation } from '../../../src/shared/state/relation';
import { contextOn, local, planOf, shopGraph } from './context';

const shop = { kind: 'database', connection: local.id, database: 'shop' } as const;

describe('relation.diagram', () => {
  it('samples the collections of the database for the tab, with the size of Sample', () => {
    const sampled = planOf(plan(contextOn('relation.diagram', shop), { args: { tab: 't1', sample: 500 } }));
    expect(sampled.steps).toEqual([
      {
        kind: 'app',
        text: 'sample the collections of shop, 500 documents each',
        action: 'relation.sample',
        args: { tab: 't1', connection: local.id, database: 'shop', size: 500 },
      },
    ]);
  });

  it('keeps Sample, Keys only, the moved boxes and the scale with the tab, read back made valid', () => {
    const kept = { sample: 2000, keysOnly: true, moved: [{ name: 'orders', left: 200, top: 40 }], scale: 0.5 } as const;
    const choices = diagramChoices(kept);
    expect(Object.keys(choices)).toEqual(['diagram']);
    expect(keptDiagram(choices)).toEqual(kept);
    expect(keptDiagram(undefined)).toEqual(firstDiagram);
    expect(keptDiagram({ diagram: '{' })).toEqual(firstDiagram);
    expect(diagramOf({ sample: 7, scale: -1, moved: [{ name: 'x' }, 'y'] })).toEqual(firstDiagram);
    const steps = planOf(plan(contextOn('relation.diagram', shop), { args: { choices: kept } })).steps as AppStep[];
    expect(steps.at(-1)?.args).toMatchObject({ memory: { choices } });
  });

  it('keeps what the diagram tab reads, and the box asked to be selected, until the tab closes', () => {
    const tab = tabId('t1');
    let state = reduceRelation(initialRelationState, { slice: 'relation', type: 'select', tab, collection: 'orders' });
    state = reduceRelation(state, {
      slice: 'relation',
      type: 'diagram-read',
      tab,
      progress: 'Sampling 3 collections…',
    });
    expect(state.diagrams[tab]).toEqual({
      progress: 'Sampling 3 collections…',
      select: { number: 1, collection: 'orders' },
    });
    state = reduceRelation(state, { slice: 'relation', type: 'diagram-read', tab, error: 'not authorized' });
    expect(state.diagrams[tab]).toEqual({ error: 'not authorized', select: { number: 1, collection: 'orders' } });
    state = reduceRelation(state, { slice: 'relation', type: 'diagram-closed', tab });
    expect(state.diagrams[tab]).toBeUndefined();
  });
});

describe('relation.read', () => {
  it('forgets the references of a database whose collection was renamed or dropped', () => {
    const found = keptAfter([], { kind: 'found', graph: shopGraph, connection: local.id });
    expect(keptFor(found, local.id, 'shop')?.graph).toBeDefined();
    const forgotten = keptAfter(found, { kind: 'database-forgotten', connection: local.id, database: 'shop' });
    expect(keptFor(forgotten, local.id, 'shop')).toBeUndefined();
  });
});
