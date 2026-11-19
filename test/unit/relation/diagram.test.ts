import { describe, expect, it } from 'vitest';
import {
  countText,
  diagramShows,
  fitScale,
  plan,
  selectBoxAction,
  view,
  zoomed,
  type DiagramState,
} from '../../../src/features/relation/diagram';
import { layout } from '../../../src/features/relation/layout';
import type { ReferenceGraph, SampledCollection } from '../../../src/features/relation/types';
import type { Context } from '../../../src/shared/feature';
import { tabId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import type { Tab } from '../../../src/shared/state/tabs';
import { contextOf, redisConnection, stateWith } from '../connection/context';
import { contextOn, local, planOf, relation, shopGraph, view as viewOf, withFields } from './context';

function state(graph: ReferenceGraph | undefined, more: Partial<DiagramState> = {}): DiagramState {
  return {
    database: 'shop',
    sample: 100,
    keysOnly: false,
    ...(graph === undefined ? {} : { graph }),
    moved: [],
    scale: 1,
    ...more,
  };
}

function twelveAndAView(): ReferenceGraph {
  const names = Array.from({ length: 12 }, (_, at) => `c${String(at).padStart(2, '0')}`);
  const collections: SampledCollection[] = names.map((name) => withFields(name, ['_id', 'refId']));
  const references = names.slice(1, 10).map((name, at) => relation(`${name}.refId`, `${names[at] ?? ''}._id`));
  return {
    database: 'shop',
    sample: 100,
    collections: [...collections, viewOf('recent', 'c00')],
    relations: [...references, relation('recent', 'c00', { kind: 'view', field: '', fieldLabel: '', toField: '' })],
  };
}

function twentyFields(): ReferenceGraph {
  const paths = ['_id', ...Array.from({ length: 17 }, (_, at) => `f${String(at)}`), 'customerId', 'productId'];
  return {
    database: 'shop',
    sample: 100,
    collections: [withFields('customers', ['_id']), withFields('orders', paths), withFields('products', ['_id'])],
    relations: [relation('orders.customerId', 'customers._id'), relation('orders.productId', 'products._id')],
  };
}

function withDiagramTab(): AppState {
  const base = stateWith([local]);
  const shows = diagramShows({ connection: local.id, database: 'shop' });
  const tab: Tab = { id: tabId('t-diagram'), shows, lastActive: 0, loaded: true };
  return { ...base, tabs: { ...base.tabs, tabs: [tab], active: tab.id } };
}

describe('relation.diagram', () => {
  it('opens one tab titled Diagram: shop', () => {
    const opened = planOf(plan(contextOn('relation.diagram'), {}));
    expect(opened.steps).toHaveLength(1);
    expect(opened.steps[0]).toMatchObject({ kind: 'app', action: 'tab.open' });
    expect(JSON.stringify(opened.steps[0])).toContain('"title":"Diagram: shop"');
  });

  it('makes the open tab active from the collection orders, with its box selected', () => {
    const target = { kind: 'collection' as const, connection: local.id, database: 'shop', collection: 'orders' };
    const context: Context = { ...contextOn('relation.diagram', target), state: withDiagramTab() };
    const opened = planOf(plan(context, {}));
    expect(opened.steps.map((step) => step.kind === 'app' && step.action)).toEqual(['tab.activate', selectBoxAction]);
    expect(opened.steps[1]).toMatchObject({
      text: 'select orders in the diagram of shop',
      args: { connection: local.id, database: 'shop', collection: 'orders' },
    });
  });

  it('is not offered without a MongoDB database', () => {
    const redis = redisConnection();
    const context = contextOf('relation.diagram', stateWith([redis]), {
      kind: 'database',
      connection: redis.id,
      database: '0',
    });
    expect(planOf(plan(context, {})).steps).toEqual([]);
  });

  it('counts 13 collections, 9 relations and 1 view, and lists Relations (10)', () => {
    const graph = twelveAndAView();
    expect(countText(graph)).toBe('13 collections · 9 relations · 1 view · 100 documents sampled per collection');
    const shown = view(state(graph));
    expect(shown.count).toBe(countText(graph));
    expect(shown.list?.title).toBe('Relations (10)');
    expect(shown.list?.lines).toHaveLength(10);
  });

  it('shows 14 rows in the order of the document, the keys among them, and +6 more fields', () => {
    const box = view(state(twentyFields())).drawing?.boxes.find((each) => each.head === 'orders');
    expect(box?.rows.map((row) => row.text)).toEqual([
      '_id',
      ...Array.from({ length: 11 }, (_, at) => `f${String(at)}`),
      'customerId',
      'productId',
    ]);
    expect(box?.last).toBe('+6 more fields');
    expect(box?.rows[12]?.right).toBe('FK · string');
  });

  it('shows 3 rows and no more fields line with Keys only', () => {
    const box = view(state(twentyFields(), { keysOnly: true })).drawing?.boxes.find((each) => each.head === 'orders');
    expect(box?.rows.map((row) => row.text)).toEqual(['_id', 'customerId', 'productId']);
    expect(box?.last).toBeUndefined();
  });

  it('marks items[].productId with N and draws the view recent dashed', () => {
    const graph: ReferenceGraph = {
      ...shopGraph,
      collections: [...shopGraph.collections, viewOf('recent', 'orders')],
      relations: [
        relation('orders.items.productId', 'products._id', { fieldLabel: 'items[].productId', several: true }),
        relation('recent', 'orders', { kind: 'view', field: '', fieldLabel: '', toField: '' }),
      ],
    };
    const arrows = view(state(graph)).drawing?.arrows ?? [];
    expect(arrows.map((arrow) => [arrow.mark, arrow.dashed])).toEqual([
      ['N', false],
      [undefined, true],
    ]);
  });

  it('keeps a box dragged 200 pixels to the right where it was dragged', () => {
    const placed = layout(shopGraph, false).boxes.find((box) => box.name === 'orders');
    const moved = [{ name: 'orders', left: (placed?.left ?? 0) + 200, top: placed?.top ?? 0 }];
    const box = view(state(shopGraph, { moved })).drawing?.boxes.find((each) => each.name === 'orders');
    expect(box?.left).toBe((placed?.left ?? 0) + 200);
    const reset = view(state(shopGraph)).drawing?.boxes.find((each) => each.name === 'orders');
    expect(reset?.left).toBe(placed?.left);
  });

  it('keeps the scale between 15% and 300%', () => {
    expect(zoomed(0.16, 0.8)).toBe(0.15);
    expect(zoomed(2.9, 1.25)).toBe(3);
    expect(zoomed(1, 1.25)).toBe(1.25);
    expect(fitScale({ width: 400, height: 300 }, { width: 2000, height: 2000 })).toBe(1);
    expect(fitScale({ width: 100_000, height: 300 }, { width: 800, height: 600 })).toBe(0.15);
  });

  it('shows shop has no collections. and disables Copy Mermaid and Save SVG…', () => {
    const shown = view(state({ ...shopGraph, collections: [], relations: [] }));
    expect(shown.state).toBe('shop has no collections.');
    expect(shown.drawing).toBeUndefined();
    expect(shown.controls.copyMermaid).toMatchObject({ enabled: false, element: 'relation.export-mermaid@toolbar' });
    expect(shown.controls.saveSvg).toMatchObject({ enabled: false, element: 'relation.export-svg@toolbar' });
  });

  it('says that no field refers to another collection when there are no relations', () => {
    const shown = view(state({ ...shopGraph, relations: [] }));
    expect(shown.list).toEqual({
      title: 'Relations (0)',
      lines: [],
      empty: 'No field of the sampled documents refers to another collection.',
    });
  });

  it('shows the message of a sample that failed and keeps the previous drawing', () => {
    const shown = view(state(shopGraph, { error: 'not authorized on shop' }));
    expect(shown.error).toBe('not authorized on shop');
    expect(shown.drawing?.boxes).toHaveLength(3);
  });

  it('says Sampling the collections… and then the progress while it reads', () => {
    expect(view(state(undefined)).state).toBe('Sampling the collections…');
    const reading = view(state(shopGraph, { progress: 'Sampled 3 of 12 collections…' }));
    expect(reading.count).toBe('Sampled 3 of 12 collections…');
    expect(reading.drawing?.boxes).toHaveLength(3);
  });

  it('offers the samples 100, 500 and 2,000', () => {
    const shown = view(state(shopGraph, { sample: 500 }));
    expect(shown.sample.choices.map((choice) => [choice.label, choice.chosen])).toEqual([
      ['100', false],
      ['500', true],
      ['2,000', false],
    ]);
  });

  it('makes a selected box stand out and the rest fade', () => {
    const shown = view(state(shopGraph, { selection: { kind: 'box', name: 'customers' } }));
    const faded = shown.drawing?.boxes.filter((box) => box.faded).map((box) => box.name);
    expect(faded).toEqual(['products']);
    expect(shown.list?.lines.map((line) => line.selected)).toEqual([true, false]);
  });
});
