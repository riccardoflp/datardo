/**
 * Feature: playground.results
 *
 * What a run returned, under the editor: the documents as a table or as text, a single value, the lines the script
 * printed, or the error with its line. The results of a run stay in the tab until the next run, and are not kept
 * when the tab closes or Datardo restarts. Ported from Mongoster's `src/webview/playground.ts`,
 * `src/playground/resultPanel.ts` and `src/playground/shell.ts` (`result`, `serialize`, `toPlaygroundError`).
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue, prettyWidth } from '../aggregate/mongosh/format';
import { relaxedText } from './results/relaxed';
import { resultTable, type ResultTable } from './results/table';
import { text } from './text';
import type { PlaygroundRun, ResultLayout, RunResult, RunValue } from './types';

export { isDocument, isDocuments, resultCell, resultTable } from './results/table';
export type { ResultCell, ResultRow, ResultTable } from './results/table';
export { relaxedText, relaxedValue } from './results/relaxed';
export { resultValue, type LastValue } from './results/value';

/** What the results are drawn from: the last result of the tab, the run in progress of it, and the connection. */
export interface ResultsInput {
  readonly result?: RunResult;
  readonly run?: PlaygroundRun;
  readonly readOnly: boolean;
  /** **Table** or **JSON**, as last chosen. */
  readonly layout: ResultLayout;
}

/** A button of the toolbar of the results. */
export interface ResultsButton {
  readonly label: string;
  readonly disabled: boolean;
  readonly pressed?: boolean;
  readonly element: 'playground.results@toolbar';
}

/** What the value of the last expression shows. */
export type ShownValue =
  | { readonly kind: 'table'; readonly table: ResultTable }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'message'; readonly text: string }
  | { readonly kind: 'none' };

/** The error of a failed or stopped run, with the link to its line in the script. */
export interface ShownError {
  readonly message: string;
  readonly line?: {
    readonly label: string;
    readonly name: string;
    readonly line: number;
    readonly element: 'playground.results@list';
  };
}

/** What the results show. */
export type ResultsView =
  | { readonly state: 'before'; readonly lines: readonly [string, string] }
  | {
      readonly state: 'running';
      readonly running: string;
      /** The results of the run before, dimmed. */
      readonly before?: ShownResult;
    }
  | ({ readonly state: 'done' } & ShownResult);

/** The results of one run. */
export interface ShownResult {
  readonly summary: string;
  readonly error?: ShownError;
  readonly output?: { readonly title: string; readonly lines: readonly string[] };
  readonly value: ShownValue;
  readonly toolbar: {
    readonly table: ResultsButton;
    readonly json: ResultsButton;
    readonly copy: ResultsButton;
    readonly copyJson: ResultsButton;
  };
  /** What **Copy** copies: the value in mongosh syntax. */
  readonly copyText?: string;
  /** What **Copy as JSON** copies: the value as relaxed Extended JSON, indented by two spaces. */
  readonly copyJsonText?: string;
}

function documentCount(value: RunValue): string {
  if (value.kind !== 'documents') {
    return '';
  }
  const count = value.documents.length;
  return ` · ${value.more ? text.results.firstDocuments(count) : text.results.documents(count)}`;
}

/** The summary: `Playground 1 · Local › shop · 38 ms · 2 documents`. */
export function summaryOf(result: RunResult): string {
  return (
    text.results.summary(result.title, result.connectionName, result.database, result.durationMs) +
    documentCount(result.value)
  );
}

function valueJson(value: RunValue): Json | undefined {
  switch (value.kind) {
    case 'documents':
      return value.documents;
    case 'value':
      return value.value;
    case 'text':
    case 'none':
      return undefined;
  }
}

function pretty(value: Json): string {
  return formattedValue(value, { kind: 'pretty', width: prettyWidth });
}

function shownValue(result: RunResult, layout: ResultLayout): ShownValue {
  const { value } = result;
  if (result.error !== undefined) {
    return { kind: 'none' };
  }
  switch (value.kind) {
    case 'documents':
      if (value.documents.length === 0) {
        return { kind: 'message', text: text.results.noDocuments };
      }
      return layout === 'table'
        ? { kind: 'table', table: resultTable(value.documents) }
        : { kind: 'text', text: pretty(value.documents) };
    case 'value':
      return { kind: 'text', text: pretty(value.value) };
    case 'text':
      return { kind: 'text', text: value.text };
    case 'none':
      return result.output.length === 0 ? { kind: 'message', text: text.results.noValue } : { kind: 'none' };
  }
}

function shownError(result: RunResult): ShownError | undefined {
  if (result.error === undefined) {
    return undefined;
  }
  const { line } = result.error;
  return {
    message: result.error.message,
    ...(line === undefined
      ? {}
      : {
          line: {
            label: text.results.line(line),
            name: text.results.showLine,
            line,
            element: 'playground.results@list',
          },
        }),
  };
}

function button(label: string, disabled: boolean, pressed?: boolean): ResultsButton {
  return { label, disabled, ...(pressed === undefined ? {} : { pressed }), element: 'playground.results@toolbar' };
}

function copies(result: RunResult): Pick<ShownResult, 'copyText' | 'copyJsonText'> {
  if (result.error !== undefined) {
    return {};
  }
  if (result.value.kind === 'text') {
    return { copyText: result.value.text, copyJsonText: JSON.stringify(result.value.text) };
  }
  const json = valueJson(result.value);
  return json === undefined ? {} : { copyText: pretty(json), copyJsonText: relaxedText(json) };
}

function shownResult(result: RunResult, layout: ResultLayout): ShownResult {
  const error = shownError(result);
  const copied = copies(result);
  const documents = result.error === undefined && result.value.kind === 'documents';
  const noValue = copied.copyText === undefined;
  return {
    summary: summaryOf(result),
    ...(error === undefined ? {} : { error }),
    ...(result.output.length === 0 ? {} : { output: { title: text.results.output, lines: result.output } }),
    value: shownValue(result, layout),
    toolbar: {
      table: button(text.results.table, !documents, documents && layout === 'table'),
      json: button(text.results.json, !documents, !documents || layout === 'json'),
      copy: button(text.results.copy, noValue),
      copyJson: button(text.results.copyJson, noValue),
    },
    ...copied,
  };
}

/** Feature: playground.results — what the results of a playground tab show, in its state. */
export function view(input: ResultsInput): ResultsView {
  if (input.run !== undefined) {
    const { run } = input;
    return {
      state: 'running',
      running: text.results.running(run.title, run.connectionName, run.database),
      ...(input.result === undefined ? {} : { before: shownResult(input.result, input.layout) }),
    };
  }
  if (input.result === undefined) {
    return {
      state: 'before',
      lines: [text.results.beforeFirstRun, input.readOnly ? text.results.readOnly : text.results.whatItDoes],
    };
  }
  return { state: 'done', ...shownResult(input.result, input.layout) };
}
