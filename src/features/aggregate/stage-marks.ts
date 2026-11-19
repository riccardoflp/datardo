/**
 * Feature: aggregate.stage-marks
 *
 * The marks on a card that tell, before and after running, that something about its stage needs attention: the name
 * or the body marked as invalid, **writes**, **must be first**, the card of the last error, dimmed, shown. Each mark
 * has a text a screen reader says, so that none is told by color alone.
 */
import { builtPipeline } from './build';
import { stagesOfEditor } from './edit-as-text';
import type { Makers } from './mongosh/helpers';
import { valueOf } from './mongosh/parse';
import { text } from './text';
import { isStageOperator } from './to-text';
import { firstStageNames, stageName, upToIndex, writeStageNames, type PipelineEditor, type Stage } from './types';

/** The marks of one card. */
export interface StageMarks {
  readonly invalidName: boolean;
  readonly invalidBody: boolean;
  readonly writes: boolean;
  readonly mustBeFirst: boolean;
  /** The last run stopped on this stage; the card is scrolled into view. */
  readonly error: boolean;
  readonly dimmed: boolean;
  readonly shown: boolean;
  /** The explanation of **must be first**, as its tooltip says it. */
  readonly mustBeFirstWhy?: string;
  /** What a screen reader says of the marks, in the order of the card. */
  readonly said: readonly string[];
}

/** What a body is checked with while it is typed: `ISODate()` and `ObjectId()` are read, not frozen. */
const checking: Makers = { now: 0, newId: () => '000000000000000000000000' };

/** Whether a body can be sent: not empty, and `query.parse` reads it. */
export function isValidBody(body: string): boolean {
  return body.trim() !== '' && valueOf(body, checking).ok;
}

function said(marks: Omit<StageMarks, 'said' | 'mustBeFirstWhy'>): readonly string[] {
  const words: [boolean, string][] = [
    [marks.invalidName, text.marks.invalidName],
    [marks.invalidBody, text.marks.invalidBody],
    [marks.writes, text.marks.writes],
    [marks.mustBeFirst, text.marks.mustBeFirst],
    [marks.error, text.marks.error],
    [marks.shown, text.marks.shown],
  ];
  return words.filter(([on]) => on).map(([, word]) => word);
}

function marksOf(editor: PipelineEditor, stage: Stage, index: number, firstEnabled: number): StageMarks {
  const name = stageName(stage);
  const marks = {
    invalidName: !isStageOperator(name),
    invalidBody: !isValidBody(stage.body),
    writes: writeStageNames.includes(name),
    mustBeFirst: stage.enabled && firstStageNames.includes(name) && index !== firstEnabled,
    error: editor.error?.stage === index,
    dimmed: !stage.enabled || (editor.shown !== undefined && index > editor.shown),
    shown: editor.shown === index,
  };
  const disabled = stage.enabled ? [] : [text.marks.disabled];
  const skipped = editor.shown !== undefined && index > editor.shown ? [text.marks.skipped] : [];
  return {
    ...marks,
    ...(marks.mustBeFirst ? { mustBeFirstWhy: text.marks.mustBeFirstWhy } : {}),
    said: [...said(marks), ...disabled, ...skipped],
  };
}

/** Feature: aggregate.stage-marks. The marks of every card, in the order of the stages. */
export function view(editor: PipelineEditor): readonly StageMarks[] {
  const firstEnabled = editor.stages.findIndex((stage) => stage.enabled);
  return editor.stages.map((stage, index) => marksOf(editor, stage, index, firstEnabled));
}

/**
 * The stage a run stopped on, and its message, for the mark of error after `aggregate.run` refused with
 * `aggregate.run/invalid-stage`; `undefined` when the stages build. An error of the server marks no card.
 */
export function errorMark(editor: PipelineEditor, makers: Makers): PipelineEditor['error'] {
  const read = stagesOfEditor(editor, makers);
  if (!read.ok || read.changed) {
    return undefined;
  }
  const built = builtPipeline(editor.stages, upToIndex(editor), makers);
  return built.ok ? undefined : { stage: built.stage, message: built.message };
}
