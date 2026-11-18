/**
 * Feature: runner.ask
 *
 * A question of a feature in a dialog, in one of four forms: a line of text with its validation, a list to pick one
 * from, a list to pick many from, or a form of several of these. `view` says what the dialog shows for what the user
 * has typed and picked so far; the question itself is held by the runner (`src/runner/start.ts`).
 */
import type { Answers } from '../../shared/feature';
import { textProblem, type Choice, type Field, type Question } from '../../shared/question';

/** A list gets a filter field once it has more than 8 items (Datardo's choice). */
export const filterFromChoices = 8;

/** What the user has given a field: a text, the value picked, or the values picked. */
export type FieldValue = string | readonly string[] | undefined;

/** What the dialog is drawn from: the question, and what the user has done in it. */
export interface AskState {
  readonly question: Question;
  readonly values: Readonly<Record<string, FieldValue>>;
  /** The text typed in the filter of each list. */
  readonly filters: Readonly<Record<string, string>>;
  /** The fields the user has typed in, or tried to answer with: their problems show. */
  readonly touched: ReadonlySet<string>;
}

/** One field as the dialog shows it. */
export interface FieldView {
  readonly field: Field;
  readonly value: FieldValue;
  /** The message under a text field while its text is not valid. */
  readonly problem?: string;
  /** Whether the list shows a filter field. */
  readonly filtered: boolean;
  /** The items the filter leaves. */
  readonly choices: readonly Choice[];
}

/** What the dialog shows. */
export interface AskView {
  readonly title: string;
  readonly text?: string;
  /** Named by the question, never **OK**. */
  readonly button: string;
  /** Disabled while a field is not valid or nothing is picked. */
  readonly buttonEnabled: boolean;
  readonly fields: readonly FieldView[];
}

/** Feature: runner.ask. The dialog of a question. */
export function view(state: AskState): AskView {
  const fields = state.question.fields.map((field) => fieldView(state, field));
  const valid = state.question.fields.every((field) => isAnswered(field, state.values[field.key]));
  return {
    title: state.question.title,
    ...(state.question.text === undefined ? {} : { text: state.question.text }),
    button: state.question.button,
    buttonEnabled: valid,
    fields,
  };
}

/** The values a question starts with: its defaults, filled in. */
export function initialValues(question: Question): Readonly<Record<string, FieldValue>> {
  return Object.fromEntries(question.fields.map((field) => [field.key, defaultOf(field)]));
}

/** The answers sent back, by the keys of the fields. */
export function answersOf(question: Question, values: Readonly<Record<string, FieldValue>>): Answers {
  return Object.fromEntries(question.fields.map((field) => [field.key, values[field.key] ?? defaultOf(field)]));
}

function defaultOf(field: Field): FieldValue {
  switch (field.kind) {
    case 'text':
      return field.default ?? '';
    case 'pick-one':
      return field.default;
    case 'pick-many':
      return field.default ?? [];
  }
}

function fieldView(state: AskState, field: Field): FieldView {
  const value = state.values[field.key] ?? defaultOf(field);
  if (field.kind === 'text') {
    const problem = textProblem(field, typeof value === 'string' ? value : '');
    const shown = problem !== undefined && state.touched.has(field.key) ? { problem } : {};
    return { field, value, filtered: false, choices: [], ...shown };
  }
  const filtered = field.choices.length > filterFromChoices;
  const filter = (state.filters[field.key] ?? '').trim().toLowerCase();
  const choices =
    filtered && filter !== ''
      ? field.choices.filter((choice) => `${choice.label} ${choice.description ?? ''}`.toLowerCase().includes(filter))
      : field.choices;
  return { field, value, filtered, choices };
}

function isAnswered(field: Field, value: FieldValue): boolean {
  switch (field.kind) {
    case 'text':
      return textProblem(field, typeof value === 'string' ? value : (field.default ?? '')) === undefined;
    case 'pick-one':
      return typeof (value ?? field.default) === 'string';
    case 'pick-many':
      return true;
  }
}
