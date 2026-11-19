/**
 * What the main process keeps of the pipeline of a collection tab (`aggregate.show`, for `tab.restore`): the app step
 * `aggregate.set-pipeline` of the editor's Operations, and the pipeline `aggregate.run` read with the mode of the tab;
 * the text `keptPipeline` writes, which the window writes alike; and the directions of the `$sort` the headers show
 * (`aggregate.sort-column`).
 */
import { describe, expect, it } from 'vitest';
import { sortDirections } from '../../../src/features/aggregate/sort-column';
import { keptPipeline, restoredPipeline, type PipelineEditor } from '../../../src/features/aggregate/types';
import { keptText, restoredQuery } from '../../../src/features/query/restore';
import { emptyTexts } from '../../../src/features/query/types';
import { keepTabPipeline, setPipeline } from '../../../src/main/aggregate';
import { AppStateHolder } from '../../../src/main/app-state';
import type { Intent } from '../../../src/shared/bridge';
import { connectionId, featureId, tabId } from '../../../src/shared/ids';

const shows = {
  kind: 'collection',
  connection: connectionId('c-local'),
  database: 'shop',
  collection: 'orders',
} as const;

const editor: PipelineEditor = {
  stages: [
    { name: '$match', body: '{ status: "paid" }', enabled: true },
    { name: '$limit', body: '10', enabled: false },
    { name: '$sort', body: '{ total: -1, _id: 1 }', enabled: true },
  ],
  shown: 0,
};

function holderWithTab(): AppStateHolder {
  const holder = new AppStateHolder();
  holder.dispatch({ slice: 'tabs', type: 'opened', seed: { shows }, key: 'orders', background: false, at: 1 });
  return holder;
}

function memoryOf(holder: AppStateHolder) {
  return holder.get().tabs.tabs.find((each) => each.id === tabId('tab-1'))?.memory;
}

describe('aggregate.show keeps the pipeline of a tab', () => {
  it('sets it with the app step of an Operation, even when it is the same, so that the window reads it back', async () => {
    const holder = holderWithTab();
    await setPipeline(holder, { tab: 'tab-1', pipeline: JSON.parse(JSON.stringify(editor)) as never });
    expect(memoryOf(holder)?.pipeline).toBe(keptPipeline(editor));
    expect(restoredPipeline(memoryOf(holder)?.pipeline)).toEqual(editor);
    const before = holder.get().tabs;
    await setPipeline(holder, { tab: 'tab-1', pipeline: JSON.parse(JSON.stringify(editor)) as never });
    expect(holder.get().tabs).not.toBe(before);
  });

  it('finds the tab by its collection when the step names none, and refuses a step without a pipeline', async () => {
    const holder = holderWithTab();
    const where = { connection: 'c-local', database: 'shop', collection: 'orders' };
    await setPipeline(holder, { ...where, pipeline: { stages: [] } });
    expect(restoredPipeline(memoryOf(holder)?.pipeline)).toEqual({ stages: [] });
    await expect(setPipeline(holder, where)).rejects.toThrow('The step needs the pipeline to set.');
  });

  it('keeps the pipeline aggregate.run read, with the mode of the tab', () => {
    const holder = holderWithTab();
    const keep = keptText({ mode: 'aggregate', texts: emptyTexts, page: 2, pageSize: 20, builderOpen: false });
    const intent: Intent = {
      feature: featureId('aggregate.run'),
      target: { kind: 'collection', connection: shows.connection, database: 'shop', collection: 'orders' },
      args: { tab: 'tab-1', pipeline: JSON.parse(JSON.stringify(editor)) as never, keep },
    };
    keepTabPipeline(holder, intent, { kind: 'cancelled' });
    expect(memoryOf(holder)).toBeUndefined();
    keepTabPipeline(holder, intent, { kind: 'read', result: { documents: [] } });
    expect(memoryOf(holder)?.pipeline).toBe(keptPipeline(editor));
    expect(restoredQuery(memoryOf(holder)?.query)).toMatchObject({ mode: 'aggregate', page: 2, pageSize: 20 });
  });

  it('writes the same text for the same pipeline, however it was built', () => {
    const shuffled = JSON.parse('{"shown":0,"stages":' + JSON.stringify(editor.stages) + '}') as PipelineEditor;
    expect(keptPipeline(shuffled)).toBe(keptPipeline(editor));
    expect(restoredPipeline('not JSON')).toBeUndefined();
    expect(restoredPipeline(undefined)).toBeUndefined();
  });
});

describe('aggregate.sort-column', () => {
  it('gives the headers the directions of the enabled $sort at the point the table shows', () => {
    expect([...sortDirections(editor)]).toEqual([]);
    const whole: PipelineEditor = { stages: editor.stages };
    expect([...sortDirections(whole)]).toEqual([
      ['total', -1],
      ['_id', 1],
    ]);
    const disabled: PipelineEditor = { stages: editor.stages.map((each) => ({ ...each, enabled: false })) };
    expect([...sortDirections(disabled)]).toEqual([]);
  });
});
