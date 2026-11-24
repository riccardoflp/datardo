/**
 * The cards that change the pipeline of a tab: add, remove, move, disable, clear, show a stage, the text, copy, and
 * the templates of the stage names.
 */
import { describe, expect, it } from 'vitest';
import { plan as addStage } from '../../../src/features/aggregate/add-stage';
import { plan as clear } from '../../../src/features/aggregate/clear';
import { copyAction, plan as copy } from '../../../src/features/aggregate/copy';
import { plan as editAsText } from '../../../src/features/aggregate/edit-as-text';
import { canMove, plan as moveStage } from '../../../src/features/aggregate/move-stage';
import { valueOf } from '../../../src/features/aggregate/mongosh/parse';
import { plan as removeStage } from '../../../src/features/aggregate/remove-stage';
import { lineOf, view } from '../../../src/features/aggregate/show';
import { plan as showStage } from '../../../src/features/aggregate/show-stage';
import { view as marks } from '../../../src/features/aggregate/stage-marks';
import {
  bodyAfterRename,
  stageTemplate,
  stageTemplateNames,
  stageTemplates,
} from '../../../src/features/aggregate/stage-template';
import { text } from '../../../src/features/aggregate/text';
import { plan as toggleStage } from '../../../src/features/aggregate/toggle-stage';
import type { PipelineEditor } from '../../../src/features/aggregate/types';
import { contextOn, editorAfter, editorOf, planOf, stepTextOf, withPipeline } from './context';
import { off, stage } from './stages';

const three = [
  stage('$match', '{ status: "paid" }'),
  stage('$group', '{ _id: "$customer" }'),
  stage('$sort', '{ _id: 1 }'),
];
const paidAndTen = [stage('$match', '{ status: "paid" }'), stage('$limit', '10')];

function after(feature: typeof addStage, editor: PipelineEditor, more = {}): PipelineEditor {
  return editorAfter(planOf(feature(contextOn('aggregate.test'), withPipeline(editor, more))));
}

function names(editor: PipelineEditor): string[] {
  return editor.stages.map((each) => each.name);
}

describe('aggregate.add-stage', () => {
  it('adds a third card named $match with the template of $match', () => {
    const plan = planOf(addStage(contextOn('aggregate.add-stage'), withPipeline(editorOf(three.slice(0, 2)))));
    const added = editorAfter(plan);
    expect(added.stages[2]).toEqual({ name: '$match', body: '{\n  \n}', enabled: true });
    expect(lineOf(added).text).toBe('3 of 3 stages enabled');
    expect(stepTextOf(plan)).toBe('add the stage $match to the pipeline of orders');
    expect(plan.danger).toEqual({ kind: 'none' });
    expect(plan.after).toEqual([]);
  });

  it('ends the stage shown', () => {
    expect(after(addStage, editorOf(three.slice(0, 2), 0)).shown).toBeUndefined();
  });

  it('goes back to the stages of a valid text, with the new one after them', () => {
    const editor = { stages: [], text: { value: '[ { $match: { a: 1 } } ]' } };
    const added = after(addStage, editor);
    expect(added.text).toBeUndefined();
    expect(names(added)).toEqual(['$match', '$match']);
  });

  it('adds nothing to a text that does not parse', () => {
    const outcome = addStage(
      contextOn('aggregate.add-stage'),
      withPipeline({ stages: [], text: { value: '[ { $match: ' } }),
    );
    expect(outcome).toMatchObject({ kind: 'refuse', code: 'aggregate.add-stage/invalid-text' });
    expect((outcome as { message: string }).message).toMatch(/^Invalid pipeline: /u);
  });
});

describe('aggregate.stage-template', () => {
  it('suggests the 22 names, $match first and $merge last', () => {
    expect(stageTemplateNames).toHaveLength(22);
    expect(stageTemplateNames[0]).toBe('$match');
    expect(stageTemplateNames.at(-1)).toBe('$merge');
  });

  it('gives a new stage renamed to $lookup the four lines of the template', () => {
    const body = bodyAfterRename({ name: '$match', body: stageTemplate('$match') ?? '' }, '$lookup');
    expect(body).toBe('{\n  from: "collection",\n  localField: "field",\n  foreignField: "_id",\n  as: "joined"\n}');
  });

  it('follows the worked examples', () => {
    const match = stageTemplate('$match') ?? '';
    expect(bodyAfterRename({ name: '$match', body: match }, '$group')).toBe(stageTemplate('$group'));
    expect(bodyAfterRename({ name: '$match', body: '{ status: "paid" }' }, '$group')).toBe('{ status: "paid" }');
    expect(bodyAfterRename({ name: '$match', body: '' }, '$limit')).toBe('10');
    expect(bodyAfterRename({ name: '$match', body: match }, '$densify')).toBe(match);
  });

  it('has templates that all parse', () => {
    for (const [name, body] of stageTemplates) {
      expect(valueOf(body, {}).ok, name).toBe(true);
    }
  });

  it('marks a stage renamed to $out as writing, and not once renamed back', () => {
    expect(marks({ stages: [stage('$out', '"x"')] })[0]?.writes).toBe(true);
    expect(marks({ stages: [stage('$match', '"x"')] })[0]?.writes).toBe(false);
  });
});

describe('aggregate.remove-stage', () => {
  it('renumbers the stages after the one removed', () => {
    expect(names(after(removeStage, editorOf(three), { stage: 1 }))).toEqual(['$match', '$sort']);
  });

  it('keeps the same stage shown when a stage before it is removed', () => {
    const four = [...three, stage('$limit', '5')];
    const removed = after(removeStage, editorOf(four, 1), { stage: 0 });
    expect(removed.shown).toBe(0);
    expect(removed.stages[0]?.name).toBe('$group');
  });

  it('shows the whole pipeline when the stage shown is removed', () => {
    const removed = after(removeStage, editorOf(three.slice(0, 2), 0), { stage: 0 });
    expect(removed.shown).toBeUndefined();
    expect(lineOf(removed).text).toBe('1 of 1 stage enabled');
  });

  it('shows the empty pipeline once the only stage is removed', () => {
    const removed = after(removeStage, editorOf(three.slice(0, 1)), { stage: 0 });
    expect(view({ editor: removed, readOnly: false }).empty?.text).toBe(text.editor.empty);
  });

  it('removes the mark of error with the stage', () => {
    const removed = after(removeStage, { stages: three, error: { stage: 1, message: 'bad' } }, { stage: 1 });
    expect(removed.error).toBeUndefined();
  });

  it('asks nothing and runs nothing', () => {
    const plan = planOf(removeStage(contextOn('aggregate.remove-stage'), withPipeline(editorOf(three), { stage: 1 })));
    expect(plan.danger).toEqual({ kind: 'none' });
    expect(plan.after).toEqual([]);
  });
});

describe('aggregate.move-stage', () => {
  const list = [stage('$match', '{}'), stage('$sort', '{ a: 1 }'), stage('$limit', '10')];

  it('moves stage 1 to the right', () => {
    const moved = after(moveStage, editorOf(list), { stage: 0, to: 'right' });
    expect(names(moved)).toEqual(['$sort', '$match', '$limit']);
  });

  it('cannot move the first stage left nor the last right', () => {
    expect(canMove(editorOf(list), 0, 'left')).toBe(false);
    expect(canMove(editorOf(list), 2, 'right')).toBe(false);
    const card = view({ editor: editorOf(list), readOnly: false }).cards;
    expect(card[0]?.moveLeft.disabled).toBe(true);
    expect(card[2]?.moveRight.disabled).toBe(true);
    expect(card[1]?.moveLeft.disabled).toBeUndefined();
  });

  it('ends the stage shown', () => {
    const moved = after(moveStage, editorOf(list, 1), { stage: 0, to: 'right' });
    expect(lineOf(moved).text).toBe('3 of 3 stages enabled');
  });

  it('marks $search as must be first once moved to place 2, and not once moved back', () => {
    const search = [stage('$search', '{}'), stage('$limit', '10')];
    const moved = after(moveStage, editorOf(search), { stage: 0, to: 'right' });
    expect(marks(moved)[1]?.mustBeFirst).toBe(true);
    const back = after(moveStage, moved, { stage: 1, to: 'left' });
    expect(marks(back)[0]?.mustBeFirst).toBe(false);
  });

  it('keeps a disabled stage disabled', () => {
    const moved = after(moveStage, editorOf([off('$match', '{}'), stage('$limit', '1')]), { stage: 0, to: 'right' });
    expect(moved.stages[1]?.enabled).toBe(false);
  });

  it('reads Move up and Move down in the query pane, on the card and in its menu, and moves the same way', () => {
    const shown = view({ editor: editorOf(list), readOnly: false, side: true }).cards[0];
    const moves = [shown?.moveLeft, shown?.moveRight, shown?.menu[0], shown?.menu[1]];
    expect(moves.map((control) => control?.label)).toEqual(['Move up', 'Move down', 'Move up', 'Move down']);
    expect([shown?.moveLeft.icon, shown?.moveRight.icon]).toEqual(['arrow-up', 'arrow-down']);
    const above = view({ editor: editorOf(list), readOnly: false }).cards[0];
    expect([above?.moveLeft.label, above?.moveRight.label]).toEqual(['Move left', 'Move right']);
    // Move down sends what Move right sends, and the commands left and right move the stage the same way.
    expect(shown?.moveRight.args).toEqual(above?.moveRight.args);
    const moved = after(moveStage, editorOf(list), shown?.moveRight.args ?? {});
    expect(names(moved)).toEqual(['$sort', '$match', '$limit']);
  });

  it('says the move in its step', () => {
    const plan = planOf(
      moveStage(contextOn('aggregate.move-stage'), withPipeline(editorOf(three), { stage: 1, to: 'left' })),
    );
    expect(stepTextOf(plan)).toBe('move stage 2 ($group) of the pipeline of orders to place 1');
  });
});

describe('aggregate.toggle-stage', () => {
  it('changes the line from 3 of 3 to 2 of 3 stages enabled', () => {
    expect(lineOf(editorOf(three)).text).toBe('3 of 3 stages enabled');
    const toggled = after(toggleStage, editorOf(three), { stage: 1 });
    expect(lineOf(toggled).text).toBe('2 of 3 stages enabled');
  });

  it('marks $search once the stage before it is enabled', () => {
    const disabled = [off('$match', '{}'), stage('$search', '{}')];
    expect(marks(editorOf(disabled))[1]?.mustBeFirst).toBe(false);
    const enabled = after(toggleStage, editorOf(disabled), { stage: 0 });
    expect(marks(enabled)[1]?.mustBeFirst).toBe(true);
  });
});

describe('aggregate.clear', () => {
  it('leaves no card and runs the empty pipeline', () => {
    const plan = planOf(clear(contextOn('aggregate.clear'), withPipeline(editorOf(three))));
    const cleared = editorAfter(plan);
    expect(cleared.stages).toEqual([]);
    expect(plan.danger).toEqual({ kind: 'none' });
    // The window that started it runs the empty pipeline (aggregate.run) once the plan is done.
    expect(plan.after).toEqual([]);
  });

  it('empties the text to []', () => {
    const cleared = after(clear, { stages: three, text: { value: '[ { $limit: 1 } ]' } });
    expect(cleared.text?.value).toBe('[]');
  });
});

describe('aggregate.show-stage', () => {
  it('shows stage 1, and the whole pipeline when clicked again', () => {
    const shown = after(showStage, editorOf(three), { stage: 0 });
    expect(shown.shown).toBe(0);
    expect(lineOf(shown).text).toBe('Output of stage 1 ($match) · ');
    expect(lineOf(shown).showFull?.element).toBe('aggregate.show-stage@toolbar');
    const again = after(showStage, shown, { stage: 0 });
    expect(again.shown).toBeUndefined();
    expect(lineOf(again).text).toBe('3 of 3 stages enabled');
  });

  it('shows the whole pipeline for the last stage', () => {
    expect(after(showStage, editorOf(three), { stage: 2 }).shown).toBeUndefined();
  });

  it('leaves the run to the window that started it', () => {
    const plan = planOf(showStage(contextOn('aggregate.show-stage'), withPipeline(editorOf(three), { stage: 0 })));
    expect(plan.after).toEqual([]);
    expect(plan.steps[0]?.text).toBe('show the output of stage 1 ($match) of the pipeline of orders');
  });

  it('names the number of the stage shown and the others', () => {
    const cards = view({ editor: editorOf(three, 0), readOnly: false }).cards;
    expect(cards[0]?.show.label).toBe('Previewing this stage — click to show the full pipeline');
    expect(cards[1]?.show.label).toBe('Show the output up to this stage');
  });
});

describe('aggregate.edit-as-text', () => {
  it('shows the stages as a text of four lines', () => {
    const shown = after(editAsText, editorOf(paidAndTen), { to: 'text' });
    expect(shown.text?.value).toBe('[\n  { $match: { status: "paid" } },\n  { $limit: 10 }\n]');
  });

  it('shows [] for an empty pipeline, and the hint', () => {
    expect(after(editAsText, editorOf([]), { to: 'text' }).text?.value).toBe('[]');
    expect(text.editor.textHint).toBe(
      '[ { $match: { field: "value" } }, { $group: { _id: "$field", n: { $sum: 1 } } } ]',
    );
  });

  it('reads a pasted text into enabled cards', () => {
    const editor = { stages: [], text: { value: '[ { $match: { a: 1 } }, { $sort: { a: -1 } } ]' } };
    const stages = after(editAsText, editor, { to: 'stages' });
    expect(stages.text).toBeUndefined();
    expect(stages.stages).toEqual([stage('$match', '{ a: 1 }'), stage('$sort', '{ a: -1 }')]);
  });

  it('keeps a disabled stage when the text is not changed, and drops it otherwise', () => {
    const withOff = [stage('$match', '{ a: 1 }'), off('$limit', '5')];
    const shown = after(editAsText, editorOf(withOff), { to: 'text' });
    expect(after(editAsText, shown, { to: 'stages' }).stages).toEqual(withOff);
    const changed = { ...shown, text: { value: '[ { $match: { a: 2 } } ]' } };
    expect(after(editAsText, changed, { to: 'stages' }).stages).toEqual([stage('$match', '{ a: 2 }')]);
  });

  it('stays on a text whose item is not a stage', () => {
    const outcome = editAsText(
      contextOn('aggregate.edit-as-text'),
      withPipeline({ stages: [], text: { value: '[ { a: 1 } ]' } }, { to: 'stages' }),
    );
    expect(outcome).toEqual({
      kind: 'refuse',
      code: 'aggregate.edit-as-text/invalid-text',
      message: 'Invalid pipeline: Stage 1 must be an object with a single $operator key',
    });
  });

  it('shows the hint and the line of disabled stages while the text is shown', () => {
    const shown = { stages: [stage('$match', '{}'), off('$limit', '1')], text: { value: '[ { $match: {} } ]' } };
    const drawn = view({ editor: shown, readOnly: false });
    expect(drawn.mode).toBe('text');
    expect(drawn.text?.hint).toBe(text.editor.textHint);
    expect(drawn.line.text.endsWith(' · disabled stages are not shown in text')).toBe(true);
  });
});

describe('aggregate.copy', () => {
  function copied(editor: PipelineEditor): unknown {
    const plan = planOf(copy(contextOn('aggregate.copy'), withPipeline(editor)));
    const [step] = plan.steps;
    expect(step).toMatchObject({ kind: 'app', action: copyAction });
    return step?.kind === 'app' ? step.args : undefined;
  }

  it('copies the four lines of the pipeline', () => {
    expect(copied(editorOf(paidAndTen))).toEqual({ text: '[\n  { $match: { status: "paid" } },\n  { $limit: 10 }\n]' });
  });

  it('copies the whole pipeline while a stage is shown, without its disabled stages', () => {
    expect(copied(editorOf([...paidAndTen, off('$sort', '{ a: 1 }')], 0))).toEqual({
      text: '[\n  { $match: { status: "paid" } },\n  { $limit: 10 }\n]',
    });
  });

  it('copies [] for an empty pipeline', () => {
    expect(copied(editorOf([]))).toEqual({ text: '[]' });
  });

  it('copies nothing from a text that does not parse', () => {
    const outcome = copy(contextOn('aggregate.copy'), withPipeline({ stages: [], text: { value: '[ { $match: ' } }));
    expect(outcome).toMatchObject({ kind: 'refuse', code: 'aggregate.copy/invalid-text' });
  });
});
