/**
 * The cards between the table and the editor (a condition dropped, a column sorted), the marks of a card, what the
 * editor shows, and the suggestions while typing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fieldSampleRequest,
  fieldsForStage,
  fieldsOfDocuments,
  stageSuggestions,
  type Known,
  type SearchIndexHint,
} from '../../../src/features/aggregate/autocomplete';
import { dropTarget, plan as dropCondition } from '../../../src/features/aggregate/drop-condition';
import { aggregateMode, view } from '../../../src/features/aggregate/show';
import { plan as sortColumn, sortField } from '../../../src/features/aggregate/sort-column';
import { errorMark, isValidBody, view as marks } from '../../../src/features/aggregate/stage-marks';
import type { PipelineEditor } from '../../../src/features/aggregate/types';
import type { Json } from '../../../src/shared/engine-request';
import { contextOn, editorAfter, editorOf, planOf, withPipeline } from './context';
import { off, stage, value } from './stages';

function dropped(editor: PipelineEditor, field: string, condition: string, within?: string): PipelineEditor {
  const args: Record<string, Json> = {
    field,
    condition: value(condition),
    ...(within === undefined ? {} : { within }),
  };
  return editorAfter(planOf(dropCondition(contextOn('aggregate.drop-condition'), withPipeline(editor, args))));
}

describe('aggregate.drop-condition', () => {
  it('creates stage 1 on an empty pipeline, and leaves the run to the window', () => {
    const plan = planOf(
      dropCondition(
        contextOn('aggregate.drop-condition'),
        withPipeline(editorOf([]), { field: 'status', condition: 'paid' }),
      ),
    );
    expect(editorAfter(plan).stages).toEqual([stage('$match', '{ status: "paid" }')]);
    expect(plan.steps[0]?.text).toBe('add the stage $match { status: "paid" } to the pipeline of orders');
    expect(plan.after).toEqual([]);
  });

  it('joins operators on the same field into one range', () => {
    const editor = editorOf([stage('$match', '{ total: { $gte: 10 } }')]);
    expect(dropped(editor, 'total', '{ $lte: 50 }').stages[0]?.body).toBe('{ total: { $gte: 10, $lte: 50 } }');
  });

  it('adds a $match after a stage that is not one', () => {
    const editor = editorOf([stage('$match', '{}'), stage('$group', '{ _id: "$customer" }')]);
    const after = dropped(editor, '_id', 'ObjectId("65f1c0de9a1b2c3d4e5f6a7b")');
    expect(after.stages[2]).toEqual(stage('$match', '{ _id: ObjectId("65f1c0de9a1b2c3d4e5f6a7b") }'));
    expect(dropTarget(editor)).toBe('Drop to add the condition as a new $match after stage 2');
  });

  it('inserts the $match after the stage shown, and shows it', () => {
    const editor = editorOf([stage('$group', '{ _id: "$a" }'), stage('$sort', '{ _id: 1 }')], 0);
    const after = dropped(editor, 'n', '1');
    expect(after.stages.map((each) => each.name)).toEqual(['$group', '$match', '$sort']);
    expect(after.shown).toBe(1);
  });

  it('puts a field of an expanded array into the $elemMatch of the array', () => {
    const after = dropped(editorOf([]), 'items.sku', '"A1"', 'items');
    expect(after.stages[0]?.body).toBe('{ items: { $elemMatch: { sku: "A1" } } }');
  });

  it('changes nothing in a stage whose body does not parse', () => {
    const outcome = dropCondition(
      contextOn('aggregate.drop-condition'),
      withPipeline(editorOf([stage('$match', '{ a: ')]), { field: 'b', condition: 1 }),
    );
    expect(outcome).toMatchObject({ kind: 'refuse', code: 'aggregate.drop-condition/invalid-stage' });
    expect((outcome as { message: string }).message).toMatch(
      /^Fix stage 1 before adding conditions by drag & drop: JSON5/u,
    );
  });
});

function sorted(editor: PipelineEditor, field: string): PipelineEditor {
  return editorAfter(planOf(sortColumn(contextOn('aggregate.sort-column'), withPipeline(editor, { field }))));
}

describe('aggregate.sort-column', () => {
  const two = [stage('$match', '{}'), stage('$group', '{ _id: "$customer", total: { $sum: "$total" } }')];

  it('adds a $sort, makes it descending, then removes it', () => {
    const once = sorted(editorOf(two), 'total');
    expect(once.stages[2]).toEqual(stage('$sort', '{ total: 1 }'));
    const twice = sorted(once, 'total');
    expect(twice.stages[2]?.body).toBe('{ total: -1 }');
    expect(sorted(twice, 'total').stages).toHaveLength(2);
  });

  it('sorts by another field one field at a time', () => {
    const editor = editorOf([...two, stage('$sort', '{ total: 1 }')]);
    expect(sorted(editor, '_id').stages[2]?.body).toBe('{ _id: 1 }');
  });

  it('inserts the $sort after the stage shown and shows it', () => {
    const editor = editorOf([...two, stage('$limit', '5')], 0);
    const after = sorted(editor, 'total');
    expect(after.shown).toBe(1);
    expect(marks(after)[2]?.dimmed).toBe(true);
  });

  it('sorts a column of an expanded array by its dotted path', () => {
    expect(sortField('items[].sku')).toBe('items.sku');
    expect(sorted(editorOf([]), 'items[].sku').stages[0]?.body).toBe('{ "items.sku": 1 }');
  });
});

describe('aggregate.stage-marks', () => {
  it('marks a name without $, and not with it', () => {
    expect(marks({ stages: [stage('match', '{}')] })[0]?.invalidName).toBe(true);
    expect(marks({ stages: [stage('$match', '{}')] })[0]?.invalidName).toBe(false);
  });

  it('marks a body that does not parse', () => {
    expect(isValidBody('{ a: 1')).toBe(false);
    expect(isValidBody('{ a: 1 }')).toBe(true);
    expect(marks({ stages: [stage('$match', '{ a: 1')] })[0]?.invalidBody).toBe(true);
  });

  it('shows writes on $merge, checked or not', () => {
    expect(marks({ stages: [off('$merge', '{ into: "x" }')] })[0]?.writes).toBe(true);
  });

  it('marks $vectorSearch after $match as must be first, and the run says why', () => {
    const editor = { stages: [stage('$match', '{}'), stage('$vectorSearch', '{}')] };
    expect(marks(editor)[1]).toMatchObject({ mustBeFirst: true, said: ['must be first'] });
    expect(errorMark(editor, {})).toEqual({
      stage: 1,
      message: '$vectorSearch must be the first stage of the pipeline',
    });
  });

  it('marks the card of the error and gives each mark its words', () => {
    const editor = {
      stages: [stage('$match', '{}'), off('$out', '"x"'), stage('$limit', '1')],
      error: { stage: 1, message: 'm' },
    };
    const said = marks(editor)[1]?.said ?? [];
    expect(said).toEqual(['writes', 'The last run stopped on this stage', 'disabled']);
  });
});

describe('aggregate.show', () => {
  it('shows the empty text and no card for a pipeline with no stages', () => {
    const drawn = view({ editor: editorOf([]), readOnly: false });
    expect(drawn.cards).toEqual([]);
    expect(drawn.empty?.text).toBe(
      'No stages: the pipeline returns the documents unchanged. Add a stage, paste a pipeline with "Edit as text", or drag a cell here.',
    );
    expect(drawn.empty?.add.element).toBe('aggregate.add-stage@empty-state');
    expect(aggregateMode.element).toBe('aggregate.show@query-bar');
  });

  it('marks the stage shown and dims the stages after it', () => {
    const drawn = view({
      editor: editorOf([stage('$match', '{}'), stage('$group', '{}'), stage('$sort', '{}')], 1),
      readOnly: false,
    });
    expect(drawn.line.text).toBe('Output of stage 2 ($group) · ');
    expect(drawn.cards[1]?.marks.shown).toBe(true);
    expect(drawn.cards[2]?.marks.dimmed).toBe(true);
  });

  it('does not offer Save as view on a read-only connection', () => {
    const elements = (readOnly: boolean): string[] =>
      view({ editor: editorOf([stage('$match', '{}')]), readOnly }).toolbar.map((each) => each.element);
    expect(elements(false)).toContain('aggregate.save-as-view@toolbar');
    expect(elements(true)).not.toContain('aggregate.save-as-view@toolbar');
    expect(elements(true)).toEqual([
      'aggregate.run@toolbar',
      'aggregate.edit-as-text@toolbar',
      'aggregate.clear@toolbar',
      'explain.show@query-bar',
      'codegen.show@query-bar',
      'aggregate.copy@toolbar',
    ]);
  });

  it('has a toolbar in two groups, each button with its icon', () => {
    const shown = view({ editor: editorOf([stage('$match', '{}')]), readOnly: false });
    expect(shown.toolbarGroups.map((group) => group.map((control) => [control.label, control.icon]))).toEqual([
      [
        ['Run', 'play'],
        ['Edit as text', 'json'],
        ['Clear', 'clear-all'],
      ],
      [
        ['Explain', 'telescope'],
        ['Code', 'code'],
        ['Copy', 'copy'],
        ['Save as view…', 'save-as'],
      ],
    ]);
    const asText = view({ editor: { ...editorOf([stage('$match', '{}')]), text: { value: '[]' } }, readOnly: false });
    expect(asText.toolbar[1]).toMatchObject({ label: 'Edit as stages', icon: 'json' });
    expect(shown.add).toMatchObject({ label: 'Add a stage at the end', icon: 'add' });
  });

  it('lays the cards one under the other in the query pane, the toolbar groups each on its line', () => {
    const editor = editorOf([stage('$match', '{}'), stage('$group', '{}'), stage('$sort', '{}')]);
    const shown = view({ editor, readOnly: false, side: true });
    expect([shown.side, shown.cards.length, shown.add?.label]).toEqual([true, 3, 'Add a stage at the end']);
    expect(shown.toolbarGroups.map((group) => group.length)).toEqual([3, 4]);
    expect(view({ editor, readOnly: false }).side).toBe(false);
  });

  it('gives each control a name a screen reader says, and sizes the cards', () => {
    const drawn = view({ editor: editorOf([stage('$match', '{}'), stage('$group', '{}')]), readOnly: false });
    expect(drawn.cards[1]?.show.label).toBe('Show the output up to this stage');
    expect(
      drawn.cards
        .flatMap((card) => [card.show, card.enabled, card.moveLeft, card.moveRight, card.remove, ...card.menu])
        .every((control) => control.label !== ''),
    ).toBe(true);
    expect(drawn.sizes).toEqual({ cardWidth: [280, 640], bodyHeight: 220 });
  });
});

const indexes: readonly SearchIndexHint[] = [
  { name: 'default', type: 'search' },
  { name: 'vec', type: 'vectorSearch' },
];

function suggested(
  text: string,
  stageName: string | undefined,
  known: Partial<Known> = {},
): ReturnType<typeof stageSuggestions> {
  const cursor = text.indexOf('|');
  return stageSuggestions(text.replace('|', ''), cursor, stageName, { fields: [], searchIndexes: indexes, ...known });
}

function labels(text: string, stageName: string | undefined, known: Partial<Known> = {}): string[] {
  return (suggested(text, stageName, known)?.items ?? []).map((item) => item.label);
}

describe('aggregate.autocomplete', () => {
  it('suggests the accumulators in $group, and $sum inserts $sum: 1', () => {
    const found = suggested('{ _id: "$customer", total: { $| } }', '$group');
    expect(found?.items.slice(0, 4).map((item) => item.label)).toEqual(['$sum', '$avg', '$min', '$max']);
    expect(found?.items[0]).toMatchObject({ insert: '$sum: 1', cursor: 6 });
  });

  it('suggests the fields of the output in a $sort after a $group', () => {
    const output = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '..', '..', 'fixtures', 'replies', 'mongodb-8.2-aggregate-group.json'),
        'utf8',
      ),
    ) as Json[];
    const fields = fieldsForStage(1, { upTo: 0, documents: output }, fieldsOfDocuments([{ status: 'paid' }]));
    expect(labels('{ | }', '$sort', { fields })).toEqual(['_id', 'quantity', 'orders']);
  });

  it('suggests the 28 stages in the text, and $lookup lands in the quotes of from', () => {
    const found = suggested('[ { $| } ]', undefined);
    expect(found?.items).toHaveLength(28);
    expect(found?.items[0]?.label).toBe('$match');
    const lookup = found?.items.find((item) => item.label === '$lookup');
    expect(lookup?.insert).toBe('$lookup: { from: "", localField: "", foreignField: "", as: "" }');
    expect(lookup?.cursor).toBe('$lookup: { from: "'.length);
  });

  it('suggests the values of whenMatched in $merge', () => {
    expect(labels('{ into: "totals", whenMatched: | }', '$merge')).toEqual([
      '"replace"',
      '"keepExisting"',
      '"merge"',
      '"fail"',
    ]);
  });

  it('suggests only the vector search indexes in $vectorSearch', () => {
    expect(labels('{ index: "|" }', '$vectorSearch')).toEqual(['"vec"']);
  });

  it('suggests nested fields with their types and shares in the first stage', () => {
    const fields = fieldsOfDocuments([{ address: { city: 'Rome' } }, { address: { city: 'Milan' } }, { name: 'x' }]);
    const found = suggested('{ addr| }', '$match', { fields });
    expect(found?.items.map((item) => [item.label, item.detail])).toEqual([
      ['address', 'object · 67%'],
      ['address.city', 'string'],
    ]);
  });

  it('suggests the fields of the collection when the output of the stage before is not in the table', () => {
    const collection = fieldsOfDocuments([{ status: 'paid' }]);
    expect(fieldsForStage(2, { upTo: 0, documents: [{ other: 1 }] }, collection)).toBe(collection);
    expect(fieldsForStage(1, { upTo: 0, documents: [] }, collection)).toBe(collection);
    expect(fieldsForStage(0, { upTo: 0, documents: [{ other: 1 }] }, collection)).toBe(collection);
  });

  it('opens no list in $limit, $skip, $count and $out', () => {
    for (const name of ['$limit', '$skip', '$count', '$out']) {
      expect(suggested('|', name), name).toBeUndefined();
      expect(suggested('"|"', name), name).toBeUndefined();
    }
  });

  it('suggests operators and stages without fields', () => {
    expect(labels('{ total: { $| } }', '$project')).toContain('$add');
    expect(labels('{ total: | }', '$project')).toContain('$$ROOT');
    expect(labels('[ { | } ]', undefined)).toHaveLength(28);
  });

  it('reads the fields from a sample of 500 documents', () => {
    expect(fieldSampleRequest({ database: 'shop', collection: 'orders' })).toEqual({
      engine: 'mongodb',
      database: 'shop',
      collection: 'orders',
      method: 'aggregate',
      arguments: [[{ $sample: { size: 500 } }], { maxTimeMS: 20000 }],
      limit: 500,
      timeLimitMs: 20000,
    });
  });

  it('suggests nothing inside a comment', () => {
    expect(suggested('{ // a|\n }', '$match')).toBeUndefined();
  });

  it('suggests the arrays of numbers first for the path of $vectorSearch', () => {
    const fields = fieldsOfDocuments([{ title: 'a', embedding: [{ $numberDouble: '0.1' }, { $numberDouble: '0.2' }] }]);
    expect(labels('{ path: | }', '$vectorSearch', { fields })[0]).toBe('embedding');
  });
});
