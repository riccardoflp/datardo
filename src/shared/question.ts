/**
 * The questions a feature asks the user, in the four forms of `runner.ask`: text, pick one, pick many, and a form of
 * several fields of the other three.
 */
import type { ConnectionColor } from './connection';
import type { Json } from './engine-request';

/** One item of a list to pick from. */
export interface Choice {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  /** A circle of a connection's color before the label (connection.set-color). */
  readonly color?: ConnectionColor;
}

/** A line of text, with what makes it valid. */
export interface TextField {
  readonly kind: 'text';
  readonly key: string;
  readonly label: string;
  readonly default?: string;
  readonly placeholder?: string;
  /** Hidden while typed: a password. */
  readonly secret?: boolean;
  /** The part of the default selected when the field opens, from `start` to `end`; all of it when absent. */
  readonly selection?: { readonly start: number; readonly end: number };
  /** The message shown under the field while the text is not valid, by rule (feature's own validation). */
  readonly rules?: readonly TextRule[];
}

/** A rule a text must keep, with the message shown while it does not. */
export type TextRule =
  | { readonly kind: 'not-empty'; readonly message: string }
  | { readonly kind: 'pattern'; readonly pattern: string; readonly message: string }
  | { readonly kind: 'not-one-of'; readonly values: readonly string[]; readonly message: string }
  | { readonly kind: 'equals'; readonly value: string; readonly message: string };

/** One item to pick among several. */
export interface PickOne {
  readonly kind: 'pick-one';
  readonly key: string;
  readonly label: string;
  readonly choices: readonly Choice[];
  readonly default?: string;
}

/** Any number of items to pick among several. */
export interface PickMany {
  readonly kind: 'pick-many';
  readonly key: string;
  readonly label: string;
  readonly choices: readonly Choice[];
  readonly default?: readonly string[];
}

/** A field of a form. */
export type Field = TextField | PickOne | PickMany;

/** What a feature asks: one field, or a form of several. */
export interface Question {
  /** The dialog's title: the feature's title. */
  readonly title: string;
  /** A sentence above the fields, when the question needs one. */
  readonly text?: string;
  /** The button that answers, named by what it does (never **OK**). */
  readonly button: string;
  readonly fields: readonly Field[];
  /** The identifier of the button that answers, when the feature's card lists the place `@dialog`. */
  readonly element?: string;
  /**
   * What a feature's own dialog needs besides its fields, for a question the window draws with a view of the feature's
   * area (the insert dialog, the form of **Update many**): the collection, the options of the dialog.
   */
  readonly about?: Json;
  /**
   * For a question with no field, which only says something before the feature goes on: the key under which its
   * button answers `true`, so that the feature knows it was answered (`saved-query.choose-folder`).
   */
  readonly key?: string;
}

/** Whether a text keeps every rule of its field, and the message of the first it breaks. */
export function textProblem(field: TextField, text: string): string | undefined {
  for (const rule of field.rules ?? []) {
    if (!keepsRule(rule, text)) {
      return rule.message;
    }
  }
  return undefined;
}

function keepsRule(rule: TextRule, text: string): boolean {
  switch (rule.kind) {
    case 'not-empty':
      return text.trim() !== '';
    case 'pattern':
      return new RegExp(rule.pattern, 'u').test(text);
    case 'not-one-of':
      return !rule.values.includes(text);
    case 'equals':
      return text === rule.value;
  }
}
