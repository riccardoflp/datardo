/**
 * Feature: explain.show
 *
 * The Explain section of a collection tab: the summary of the explain of the query in the query bar, or of the
 * pipeline: the verdict, the numbers, the note, the suggested index, the winning plan as a tree, and the stages of the
 * pipeline after the query; or, with **Raw**, the whole output (`explain.raw`). `view` says what the section shows
 * from its state; `plan` is what Go to starts: the active collection tab shows its Explain section.
 */
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { activeTabOf } from '../../shared/state/tabs';
import { groupThousands } from '../../shared/text-units';
import { formattedValue } from '../aggregate/mongosh/format';
import { view as rawView, type RawView } from './raw';
import type { ExplainResult } from './run';
import { indexKeysDocument, indexKeysText } from './suggest-index';
import { text } from './text';
import type { ExplainKind, ExplainSummary, IndexKey, WinningPlanNode } from './types';

/** The section's tab name, as `tab.activate` takes it. */
export const explainSection = 'explain';

/** What the section is drawn from. */
export interface ExplainSectionState {
  /** What the query bar explains now: the query in **Find**, the pipeline in **Aggregate**. */
  readonly kind: ExplainKind;
  /** Whether the explain runs now. */
  readonly running: boolean;
  readonly result?: ExplainResult;
  /** The message of the error of the last explain, of the query or of the server. */
  readonly error?: string;
  readonly cancelled: boolean;
  /** Whether **Raw** is chosen; the choice stays while the section shows other explains. */
  readonly raw: boolean;
  /** The rows of the raw output folded or unfolded by a click (`explain.raw`). */
  readonly toggled: readonly string[];
  readonly readOnly: boolean;
  /** Whether the tab is of a view, which has no indexes of its own. */
  readonly view: boolean;
}

/** How a mark or a stage is drawn: a warning and a good one differ by an icon as well as by color. */
export type Tone = 'warning' | 'good' | 'plain';

/** A mark of the verdict. */
export interface VerdictMark {
  readonly text: string;
  readonly tone: Tone;
  readonly icon?: 'warning' | 'check';
  readonly hint?: string;
}

/** One row of the winning plan. */
export interface PlanRow {
  readonly depth: number;
  /** The name of the stage, with `└ ` before it under another. */
  readonly stage: string;
  readonly tone: Tone;
  readonly icon?: 'warning' | 'check';
  /** *120 out · 120 keys · 120 docs*; empty when the explain gives none. */
  readonly counts: string;
  /** `indexName: "status_1"  keyPattern: { status: 1 }`, cut when drawn and whole on hover. */
  readonly details: string;
}

/** The suggested index and its **Create…**, which starts `index.create` with the keys in their order. */
export interface SuggestionView {
  readonly label: string;
  readonly keys: string;
  readonly hint: string;
  /** Not on a view, nor on a read-only connection. Its card names no place for it, so it carries no element. */
  readonly create?: {
    readonly label: string;
    readonly hint: string;
    readonly feature: 'index.create';
    readonly keys: IndexKey[];
  };
}

/** The summary as the section shows it. */
export interface SummaryView {
  readonly verdict: readonly VerdictMark[];
  readonly numbers: readonly { readonly value: string; readonly name: string }[];
  readonly note?: string;
  readonly suggestion?: SuggestionView;
  readonly winningPlan?: { readonly title: string; readonly rows: readonly PlanRow[] };
  readonly stagesAfterQuery?: {
    readonly title: string;
    readonly rows: readonly { readonly name: string; readonly counts: string }[];
  };
}

/** What the Explain section shows. */
export interface ExplainSectionView {
  readonly title: string;
  readonly raw: { readonly label: string; readonly enabled: boolean; readonly element: 'explain.raw@toolbar' };
  readonly running?: string;
  readonly message?: string;
  readonly cancelled?: { readonly text: string; readonly runAgain: string; readonly element: 'explain.run@query-bar' };
  readonly summary?: SummaryView;
  readonly output?: RawView;
}

function warning(textOf: string, hint?: string): VerdictMark {
  return { text: textOf, tone: 'warning', icon: 'warning', ...(hint === undefined ? {} : { hint }) };
}

/** The marks of the verdict, in order. */
export function verdictOf(summary: ExplainSummary): readonly VerdictMark[] {
  const marks: VerdictMark[] = [];
  if (summary.collscan) {
    marks.push(warning(text.verdict.collscan, text.verdict.collscanHint));
  }
  marks.push(
    ...summary.indexes.map((name): VerdictMark => ({ text: text.verdict.index(name), tone: 'good', icon: 'check' })),
  );
  if (!summary.collscan && summary.indexes.length === 0 && summary.tree !== undefined) {
    marks.push({ text: summary.tree.stage, tone: 'plain' });
  }
  if (summary.inMemorySort) {
    marks.push(warning(text.verdict.inMemorySort, text.verdict.inMemorySortHint));
  }
  if (summary.rejectedPlans > 0) {
    marks.push({ text: text.verdict.rejectedPlans(summary.rejectedPlans), tone: 'plain' });
  }
  return marks;
}

function numbersOf(summary: ExplainSummary): SummaryView['numbers'] {
  const { returned, keysExamined, docsExamined, milliseconds } = summary.numbers;
  const shown: { value: string; name: string }[] = [];
  const add = (value: number | undefined, name: string, written = groupThousands): void => {
    if (value !== undefined) {
      shown.push({ value: written(value), name });
    }
  };
  add(returned, text.numbers.returned);
  add(keysExamined, text.numbers.keysExamined);
  add(docsExamined, text.numbers.docsExamined);
  add(milliseconds, text.numbers.time, text.numbers.milliseconds);
  return shown;
}

/** The note, when the documents examined are at least ten times those returned. */
export function noteOf(summary: ExplainSummary): string | undefined {
  const examined = summary.numbers.docsExamined ?? 0;
  const returned = summary.numbers.returned ?? 0;
  if (examined === 0 || examined < Math.max(returned, 1) * 10) {
    return undefined;
  }
  return returned > 0 ? text.note.perReturned(Math.round(examined / returned)) : text.note.noneReturned(examined);
}

function toneOf(stage: string): Pick<PlanRow, 'tone' | 'icon'> {
  if (stage === 'COLLSCAN' || stage === 'SORT') {
    return { tone: 'warning', icon: 'warning' };
  }
  return /IXSCAN|IDHACK/u.test(stage) ? { tone: 'good', icon: 'check' } : { tone: 'plain' };
}

function countsOf(node: WinningPlanNode): string {
  const parts = [
    node.returned === undefined ? undefined : text.counts.out(node.returned),
    node.keysExamined === undefined ? undefined : text.counts.keys(node.keysExamined),
    node.docsExamined === undefined ? undefined : text.counts.docs(node.docsExamined),
  ];
  return parts.filter((part): part is string => part !== undefined).join(' · ');
}

/** The rows of the winning plan: the stage that produces the result first, each input under its stage. */
export function planRows(node: WinningPlanNode, depth = 0): readonly PlanRow[] {
  const details = node.details.map((detail) => `${detail.name}: ${formattedValue(detail.value, { kind: 'one-line' })}`);
  const row: PlanRow = {
    depth,
    stage: depth === 0 ? node.stage : `└ ${node.stage}`,
    ...toneOf(node.stage),
    counts: countsOf(node),
    details: details.join('  '),
  };
  return [row, ...node.children.flatMap((child) => planRows(child, depth + 1))];
}

function suggestionOf(state: ExplainSectionState, keys: readonly IndexKey[]): SuggestionView {
  const shown = { label: text.suggestion.label, keys: indexKeysText(keys), hint: text.suggestion.hint };
  if (state.view || state.readOnly) {
    return shown;
  }
  const create = { label: text.suggestion.create, hint: text.suggestion.createHint, feature: 'index.create' as const };
  return { ...shown, create: { ...create, keys: [...keys] } };
}

function summaryView(state: ExplainSectionState, result: ExplainResult): SummaryView {
  const { summary } = result;
  const note = noteOf(summary);
  const after = summary.stagesAfterQuery.map((stage) => ({
    name: stage.name,
    counts: [
      stage.returned === undefined ? undefined : text.counts.out(stage.returned),
      stage.milliseconds === undefined ? undefined : text.counts.about(stage.milliseconds),
    ]
      .filter((part): part is string => part !== undefined)
      .join(' · '),
  }));
  return {
    verdict: verdictOf(summary),
    numbers: numbersOf(summary),
    ...(note === undefined ? {} : { note }),
    ...(result.suggestion === undefined ? {} : { suggestion: suggestionOf(state, result.suggestion) }),
    ...(summary.tree === undefined ? {} : { winningPlan: { title: text.winningPlan, rows: planRows(summary.tree) } }),
    ...(after.length === 0 ? {} : { stagesAfterQuery: { title: text.stagesAfterQuery, rows: after } }),
  };
}

/** The error shown in place of the summary: of the query or of the server, or of the query that the explain ran. */
function errorOf(state: ExplainSectionState): string | undefined {
  return state.error ?? state.result?.failure;
}

/** What the section shows below its toolbar, from its state. */
function bodyOf(
  state: ExplainSectionState,
): Pick<ExplainSectionView, 'running' | 'message' | 'cancelled' | 'summary' | 'output'> {
  if (state.running) {
    return { running: text.running };
  }
  if (state.cancelled) {
    return { cancelled: { text: text.cancelled, runAgain: text.runAgain, element: 'explain.run@query-bar' } };
  }
  const error = errorOf(state);
  if (error !== undefined) {
    return { message: error };
  }
  const { result } = state;
  if (result === undefined) {
    return {};
  }
  return state.raw
    ? { output: rawView({ output: result.output, toggled: state.toggled }) }
    : { summary: summaryView(state, result) };
}

/** Feature: explain.show — what the Explain section shows. */
export function view(state: ExplainSectionState): ExplainSectionView {
  const shown = !state.running && !state.cancelled && errorOf(state) === undefined && state.result !== undefined;
  return {
    title: text.title(state.kind),
    raw: { label: state.raw ? text.summary : text.raw, enabled: shown, element: 'explain.raw@toolbar' },
    ...bodyOf(state),
  };
}

/** The keys of a suggestion as `index.create` is started with them: a document of canonical Extended JSON. */
export { indexKeysDocument };

/** Feature: explain.show — Go to's **Explain**: the active collection tab shows its Explain section. */
export function plan(context: Context, _answers: Answers): Outcome {
  const tab = activeTabOf(context.state.tabs);
  const empty = { danger: noDanger, undo: { cannot: text.nothingRecorded }, publishes: false, after: [] };
  if (tab?.shows.kind !== 'collection') {
    return run({ title: text.section, steps: [], ...empty });
  }
  const { collection } = tab.shows;
  return run({
    title: text.show.plan(collection),
    steps: [
      {
        kind: 'app',
        text: text.show.step(collection),
        action: 'tab.activate',
        args: { tab: tab.id, section: explainSection },
      },
    ],
    ...empty,
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('explain.show'), plan };
