/**
 * Feature: aggregate.show
 *
 * The pipeline editor of the Documents section, in place of the filter, sort and projection of the query bar: the
 * stage list (or the text after **Edit as text**), the toolbar, and the line of what the table shows. `view` says what
 * is shown and, for each control, the feature it starts with its arguments; the window adds `tab` and `pipeline` (the
 * editor as it is) to the arguments of every intent it sends. It is shown on every connection, read-only ones too,
 * where **Save as view…** is not offered.
 */
import type { Json } from '../../shared/engine-request';
import { canMove } from './move-stage';
import { numberLabel } from './show-stage';
import { view as marksView, type StageMarks } from './stage-marks';
import { stageTemplateNames } from './stage-template';
import { text } from './text';
import { stageName, type PipelineEditor, type Stage } from './types';

/** A control of the editor: its text, its identifier with its place, and the feature it starts with what. */
export interface EditorControl {
  readonly label: string;
  readonly element: string;
  readonly feature: string;
  readonly args?: Json;
  readonly disabled?: boolean;
}

/** One card of the stage list. */
export interface StageCard {
  readonly index: number;
  /** The number, `1` for the first stage; the button that shows the output up to this stage. */
  readonly number: string;
  readonly show: EditorControl;
  /** The name, a text field with the templates as suggestions. */
  readonly name: {
    readonly value: string;
    readonly label: string;
    readonly element: 'aggregate.stage-template@list';
    readonly suggestions: readonly string[];
  };
  readonly enabled: EditorControl & { readonly checked: boolean };
  readonly marks: StageMarks & { readonly element: 'aggregate.stage-marks@list' };
  readonly moveLeft: EditorControl;
  readonly moveRight: EditorControl;
  readonly remove: EditorControl;
  /** The context menu of the card. */
  readonly menu: readonly EditorControl[];
  /** The body, in the editor; `Ctrl+Enter` runs up to the stage shown. */
  readonly body: {
    readonly value: string;
    readonly label: string;
    readonly element: 'aggregate.autocomplete@editor';
    readonly run: EditorControl;
  };
}

/** What the pipeline editor shows. */
export interface PipelineEditorView {
  readonly mode: 'stages' | 'text';
  readonly cards: readonly StageCard[];
  /** **+** after the last card. */
  readonly add?: EditorControl;
  /** What an empty pipeline shows in place of the cards. */
  readonly empty?: { readonly text: string; readonly add: EditorControl };
  /** The whole pipeline in one editor, while the text is shown; `Ctrl+Enter` applies it and runs it. */
  readonly text?: {
    readonly value: string;
    readonly label: string;
    readonly hint: string;
    readonly invalid?: string;
    readonly run: EditorControl;
  };
  readonly toolbar: readonly EditorControl[];
  /** The line of what the table shows, with **show full pipeline** while a stage is shown. */
  readonly line: { readonly text: string; readonly showFull?: EditorControl };
  /** A card is as wide as its longest line within these, in px; its body grows to `bodyHeight` before it scrolls. */
  readonly sizes: { readonly cardWidth: readonly [number, number]; readonly bodyHeight: number };
}

/** What the editor is drawn from. */
export interface PipelineEditorInput {
  readonly editor: PipelineEditor;
  readonly readOnly: boolean;
}

/** The entry **Aggregate** of the mode menu of the query bar, which shows the editor. */
export const aggregateMode = { label: 'Aggregate', element: 'aggregate.show@query-bar' } as const;

/** The sizes of a card (Mongoster's). */
export const cardSizes = { cardWidth: [280, 640] as const, bodyHeight: 220 };

function control(label: string, element: string, feature: string, args?: Json): EditorControl {
  return { label, element, feature, ...(args === undefined ? {} : { args }) };
}

/** A move control, disabled at the end the stage cannot move past. */
function moveControl(editor: PipelineEditor, index: number, to: 'left' | 'right', element: string): EditorControl {
  const label = to === 'left' ? text.editor.moveLeft : text.editor.moveRight;
  const moved = control(label, element, 'aggregate.move-stage', { stage: index, to });
  return canMove(editor, index, to) ? moved : { ...moved, disabled: true };
}

function menuOf(stage: Stage, index: number, editor: PipelineEditor): readonly EditorControl[] {
  return [
    moveControl(editor, index, 'left', 'aggregate.move-stage@item-menu'),
    moveControl(editor, index, 'right', 'aggregate.move-stage@item-menu'),
    control(
      stage.enabled ? text.editor.disable : text.editor.enable,
      'aggregate.toggle-stage@item-menu',
      'aggregate.toggle-stage',
      {
        stage: index,
        enabled: !stage.enabled,
      },
    ),
    control(text.editor.remove, 'aggregate.remove-stage@item-menu', 'aggregate.remove-stage', { stage: index }),
  ];
}

function cardOf(editor: PipelineEditor, index: number, marks: StageMarks): StageCard {
  const stage = editor.stages[index] ?? { name: '', body: '', enabled: true };
  return {
    index,
    number: String(index + 1),
    show: control(numberLabel(editor, index), 'aggregate.show-stage@list', 'aggregate.show-stage', { stage: index }),
    name: {
      value: stage.name,
      label: text.editor.name,
      element: 'aggregate.stage-template@list',
      suggestions: stageTemplateNames,
    },
    enabled: {
      ...control(text.editor.enabled, 'aggregate.toggle-stage@list', 'aggregate.toggle-stage', {
        stage: index,
        enabled: !stage.enabled,
      }),
      checked: stage.enabled,
    },
    marks: { ...marks, element: 'aggregate.stage-marks@list' },
    moveLeft: moveControl(editor, index, 'left', 'aggregate.move-stage@list'),
    moveRight: moveControl(editor, index, 'right', 'aggregate.move-stage@list'),
    remove: control(text.editor.remove, 'aggregate.remove-stage@list', 'aggregate.remove-stage', { stage: index }),
    menu: menuOf(stage, index, editor),
    body: {
      value: stage.body,
      label: text.editor.body(index + 1),
      element: 'aggregate.autocomplete@editor',
      run: control(text.toolbar.run, 'aggregate.run@editor', 'aggregate.run'),
    },
  };
}

/** The line of what the table shows. */
export function lineOf(editor: PipelineEditor): PipelineEditorView['line'] {
  const enabled = editor.stages.filter((stage) => stage.enabled).length;
  const textNote = editor.text !== undefined && enabled < editor.stages.length ? text.line.textDisabled : '';
  const shown = editor.shown === undefined ? undefined : editor.stages[editor.shown];
  if (editor.shown !== undefined && shown !== undefined) {
    return {
      text: `${text.line.shown(editor.shown + 1, stageName(shown))}${textNote}`,
      showFull: control(text.line.showFull, 'aggregate.show-stage@toolbar', 'aggregate.show-stage'),
    };
  }
  const counted = editor.stages.length === 0 ? '' : text.line.enabled(enabled, editor.stages.length);
  return { text: `${counted}${textNote}` };
}

function toolbarOf(editor: PipelineEditor, readOnly: boolean): readonly EditorControl[] {
  const asText = editor.text === undefined;
  return [
    control(text.toolbar.run, 'aggregate.run@toolbar', 'aggregate.run', { whole: true }),
    control(text.toolbar.clear, 'aggregate.clear@toolbar', 'aggregate.clear'),
    control(text.toolbar.explain, 'explain.show@query-bar', 'explain.show'),
    ...(readOnly ? [] : [control(text.toolbar.saveAsView, 'aggregate.save-as-view@toolbar', 'aggregate.save-as-view')]),
    control(
      asText ? text.toolbar.editAsText : text.toolbar.editAsStages,
      'aggregate.edit-as-text@toolbar',
      'aggregate.edit-as-text',
      {
        to: asText ? 'text' : 'stages',
      },
    ),
    control(text.toolbar.copy, 'aggregate.copy@toolbar', 'aggregate.copy'),
    control(text.toolbar.code, 'codegen.show@query-bar', 'codegen.show'),
  ];
}

/** Feature: aggregate.show. What the pipeline editor shows. */
export function view(input: PipelineEditorInput): PipelineEditorView {
  const { editor } = input;
  const marks = marksView(editor);
  const cards = editor.text === undefined ? marks.map((stageMarks, index) => cardOf(editor, index, stageMarks)) : [];
  const empty = editor.text === undefined && editor.stages.length === 0;
  const base = {
    mode: editor.text === undefined ? 'stages' : 'text',
    cards,
    toolbar: toolbarOf(editor, input.readOnly),
    line: lineOf(editor),
    sizes: cardSizes,
  } as const;
  if (editor.text !== undefined) {
    const run = control(text.toolbar.run, 'aggregate.run@editor', 'aggregate.run', { whole: true });
    const shown = { value: editor.text.value, label: text.editor.textLabel, hint: text.editor.textHint, run };
    return { ...base, text: editor.text.invalid === undefined ? shown : { ...shown, invalid: editor.text.invalid } };
  }
  if (empty) {
    return {
      ...base,
      empty: {
        text: text.editor.empty,
        add: control(text.editor.addStageEmpty, 'aggregate.add-stage@empty-state', 'aggregate.add-stage'),
      },
    };
  }
  return { ...base, add: control(text.editor.addStage, 'aggregate.add-stage@list', 'aggregate.add-stage') };
}
