/**
 * Feature: console.input
 *
 * Where a command is typed: the prompt of the session, the editor on one line that grows, **Run** (or **Stop** while a
 * command runs), the hint of the command being typed, and the suggestions. A text of several lines is several
 * commands, run one after the other; more than 500 are not run.
 */
import { hintFor, type ArgumentHint } from './argument-hint';
import { suggestions, suggestionsShown, type Opening, type Suggestions } from './autocomplete';
import { promptOf } from './session';
import { text } from './text';
import type { CommandDoc, ConsoleState } from './types';

/** The input grows to 8 lines and then scrolls (Datardo's choice). */
export const inputLines = 8;

/** The kinds of text the editor colors. */
export type TokenKind = 'command' | 'string' | 'number' | 'escape' | 'unclosed';

/** A part of the line to color, from `from` to `to` (excluded). */
export interface LineToken {
  readonly from: number;
  readonly to: number;
  readonly kind: TokenKind;
}

/** The lines of a text to run, in order: those that are not empty, without the spaces at their ends. */
export function linesToRun(typed: string): readonly string[] {
  return typed
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function quotedTokens(line: string, open: number, tokens: LineToken[]): number {
  const quote = line[open];
  let index = open + 1;
  while (index < line.length && line[index] !== quote) {
    const escape = line[index] === '\\' ? (line[index + 1] === 'x' && quote === '"' ? 4 : 2) : 0;
    if (escape > 0 && (quote === '"' || line[index + 1] === "'")) {
      tokens.push({ from: index, to: Math.min(line.length, index + escape), kind: 'escape' });
      index += escape;
    } else {
      index += 1;
    }
  }
  if (index >= line.length) {
    tokens.push({ from: open, to: line.length, kind: 'unclosed' });
    return line.length;
  }
  tokens.push({ from: open, to: index + 1, kind: 'string' });
  return index + 1;
}

/** The parts of a line the editor colors: the command's name, quoted text, numbers, escapes, a quote never closed. */
export function lineTokens(line: string): readonly LineToken[] {
  const tokens: LineToken[] = [];
  let index = 0;
  let word = 0;
  while (index < line.length) {
    if (line[index] === ' ' || line[index] === '\t') {
      index += 1;
      continue;
    }
    const start = index;
    while (index < line.length && line[index] !== ' ' && line[index] !== '\t') {
      index = line[index] === '"' || line[index] === "'" ? quotedTokens(line, index, tokens) : index + 1;
    }
    const plain = line.slice(start, index);
    if (word === 0 && !/["']/u.test(plain)) {
      tokens.push({ from: start, to: index, kind: 'command' });
    } else if (/^[-+]?\d+(\.\d+)?$/u.test(plain)) {
      tokens.push({ from: start, to: index, kind: 'number' });
    }
    word += 1;
  }
  return tokens.sort((first, second) => first.from - second.from);
}

/** A button of the input, with the feature it starts. */
export interface InputButton {
  readonly label: string;
  readonly feature: string;
  readonly element: string;
}

/** What the input shows. */
export interface InputView {
  readonly label: string;
  /** The prompt; while a command runs it keeps its place, and a moving mark is drawn over it. */
  readonly prompt: string;
  /** A command is running: the moving mark is shown in the prompt's place, and the button is **Stop**. */
  readonly running: boolean;
  readonly placeholder: string;
  readonly button: InputButton;
  /** Every text the button takes, **Run** and **Stop**: it is as wide as the widest, so that nothing moves. */
  readonly buttonLabels: readonly string[];
  readonly tokens: readonly LineToken[];
  readonly hint?: ArgumentHint;
  /** The list of suggestions when it is open, its first 10 shown at a time, and the one selected. */
  readonly suggestions?: Suggestions & { readonly shown: number; readonly selected: number };
}

/** What the input is drawn from. */
export interface InputState {
  readonly console: ConsoleState;
  readonly typed: string;
  readonly caret: number;
  readonly docs: readonly CommandDoc[];
  /** The list of suggestions, when it is open: how it was opened, and the one selected. */
  readonly list?: { readonly opening: Opening; readonly selected: number };
}

const runButton: InputButton = { label: text.input.run, feature: 'console.run', element: 'console.run@editor' };
const stopButton: InputButton = { label: text.input.stop, feature: 'console.stop', element: 'console.stop@editor' };

/** The line the caret is on, and the caret's place in it. */
function caretLine(typed: string, caret: number): { readonly line: string; readonly caret: number } {
  const start = typed.lastIndexOf('\n', caret - 1) + 1;
  const end = typed.indexOf('\n', caret);
  return { line: typed.slice(start, end < 0 ? typed.length : end), caret: caret - start };
}

/** Feature: console.input — what the input shows. */
export function view(state: InputState): InputView {
  const running = state.console.status === 'running';
  const current = caretLine(state.typed, state.caret);
  const hint = hintFor(current.line, state.docs);
  const list =
    state.list === undefined ? undefined : suggestions(current.line, current.caret, state.docs, state.list.opening);
  return {
    label: text.input.label,
    prompt: promptOf(state.console.session),
    running,
    placeholder: state.console.status === 'connecting' ? text.show.connecting : text.input.placeholder,
    button: running ? stopButton : runButton,
    buttonLabels: [runButton.label, stopButton.label],
    tokens: lineTokens(current.line),
    ...(hint === undefined ? {} : { hint }),
    ...(list === undefined || state.list === undefined
      ? {}
      : {
          suggestions: {
            ...list,
            shown: suggestionsShown,
            selected: Math.min(state.list.selected, list.items.length - 1),
          },
        }),
  };
}
