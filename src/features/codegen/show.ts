/**
 * Feature: codegen.show
 *
 * The Code section: the code of the query in the query bar, of the pipeline, or of a chart, in the language chosen,
 * as the lines of the query or as a full program. Nothing is sent to a server. `view` says what the section shows
 * from its state; `plan` is what Go to and the section bar start: the active collection tab shows its Code section.
 * The section starts it again with `{ choices }` when the language or **Full program** changes, so that the tab keeps
 * them.
 */
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import type { Json } from '../../shared/engine-request';
import { featureId } from '../../shared/ids';
import { activeTabOf, type TabMemory } from '../../shared/state/tabs';
import { startArgs } from '../nav/types';
import type { Makers } from '../aggregate/mongosh/helpers';
import { editorStages, parsedText, sourceOf } from '../chart/draw';
import { firstInput } from '../chart/options';
import type { ChartOptions } from '../chart/types';
import { codeQuery, type CodeResult } from './source';
import { text } from './text';
import { codeLanguages, generatedCode, type CodeLanguage } from './types';

/** The section's tab name, as `tab.activate` takes it. */
export const codeSection = 'code';

/** What the section is drawn from: the query as it was taken, and the choices kept with the tab. */
export interface CodeSectionState {
  /** `codegen.source` of the query when the section was shown or **Code** was last pressed. */
  readonly source: CodeResult;
  /** The collection, or the view, of the tab. */
  readonly collection: string;
  readonly language: CodeLanguage;
  readonly program: boolean;
}

/** The state of a section shown for the first time: **Node.js**, **Full program** off. */
export function firstChoices(): Pick<CodeSectionState, 'language' | 'program'> {
  return { language: 'nodejs', program: false };
}

/** What the code is asked of: the query bar or the pipeline of the tab, or the aggregation of a chart. */
export type CodeAsk =
  | { readonly kind: 'query' }
  | { readonly kind: 'chart'; readonly options: ChartOptions; readonly mode: 'filter' | 'pipeline' };

/** What a collection tab holds now: its names, its mode, the texts of its bar as typed, and its pipeline. */
export interface TabQuery {
  readonly database: string;
  readonly collection: string;
  readonly mode: 'find' | 'aggregate';
  readonly texts: { readonly filter: string; readonly sort: string; readonly project: string };
  /** The pipeline of the editor, as `editorJson` gives it. */
  readonly pipeline: Json;
}

/**
 * The query the section writes as code, taken when it is shown or **Code** is pressed (`codegen.source`): the texts
 * are read as `query.parse` reads them; every enabled stage of the pipeline; the stages of a chart after its data.
 */
export function codeOfTab(ask: CodeAsk, tab: TabQuery, makers: Makers): CodeResult {
  const where = { database: tab.database, collection: tab.collection };
  if (ask.kind === 'chart') {
    const given = { data: ask.mode, filter: tab.texts.filter, pipeline: tab.pipeline };
    const source = sourceOf({ ...where, connection: '', input: firstInput, ...given }, makers);
    return 'invalid' in source
      ? { kind: 'invalid', message: text.invalid(source.invalid) }
      : codeQuery({ ...where, kind: 'chart', chart: ask.options, source });
  }
  if (tab.mode === 'aggregate') {
    const read = editorStages(tab.pipeline, makers);
    return 'invalid' in read
      ? { kind: 'invalid', message: text.invalid(read.invalid) }
      : codeQuery({ ...where, kind: 'aggregate', stages: read.stages });
  }
  return codeQuery({
    ...where,
    kind: 'find',
    filter: parsedText(tab.texts.filter, makers),
    projection: parsedText(tab.texts.project, makers),
    sort: parsedText(tab.texts.sort, makers),
  });
}

/** The language and **Full program** as the tab keeps them (`TabMemory.choices`), by name. */
export function codeChoices(choices: Pick<CodeSectionState, 'language' | 'program'>): Readonly<Record<string, string>> {
  return { codeLanguage: choices.language, codeProgram: choices.program ? 'on' : 'off' };
}

/** The language and **Full program** the tab kept; each one missing or not valid as at first. */
export function choicesOfCode(
  choices: Readonly<Record<string, unknown>> | undefined,
): Pick<CodeSectionState, 'language' | 'program'> {
  const language = codeLanguages.find((each) => each.language === choices?.['codeLanguage'])?.language;
  return { language: language ?? firstChoices().language, program: choices?.['codeProgram'] === 'on' };
}

/** What the Code section shows. */
export interface CodeSectionView {
  readonly title: string;
  readonly languages: {
    readonly label: string;
    readonly tabs: readonly { readonly language: CodeLanguage; readonly label: string; readonly selected: boolean }[];
  };
  readonly program: { readonly label: string; readonly hint: string; readonly checked: boolean };
  readonly copy: { readonly label: string; readonly enabled: boolean; readonly element: 'codegen.copy@toolbar' };
  /** The code, when the query can be written as code. */
  readonly code?: string;
  /** The message said in place of the code: *Invalid query: Filter must be an object*. */
  readonly message?: string;
}

/** The code the section shows, or undefined when the query cannot be written as code. */
export function shownCode(state: CodeSectionState): string | undefined {
  const { source } = state;
  if (source.kind === 'invalid') {
    return undefined;
  }
  return generatedCode(state.language, source.query, {
    database: source.database,
    collection: source.collection,
    program: state.program,
  });
}

/** Feature: codegen.show — what the Code section shows. */
export function view(state: CodeSectionState): CodeSectionView {
  const { source } = state;
  const code = shownCode(state);
  const words = source.kind === 'code' ? source.title : '';
  return {
    title: source.kind === 'code' ? text.title(state.collection, words) : text.section,
    languages: {
      label: text.languages,
      tabs: codeLanguages.map(({ language, label }) => ({ language, label, selected: language === state.language })),
    },
    program: { label: text.program.label, hint: text.program.hint, checked: state.program },
    copy: { label: text.copy, enabled: code !== undefined, element: 'codegen.copy@toolbar' },
    ...(code === undefined ? {} : { code }),
    ...(source.kind === 'invalid' ? { message: source.message } : {}),
  };
}

/** The memory of the tab with the choices asked to be kept (`args.choices`), when some are. */
function keptMemory(memory: TabMemory | undefined, answers: Answers): TabMemory | undefined {
  const asked = startArgs(answers)['choices'];
  if (typeof asked !== 'object' || asked === null) {
    return undefined;
  }
  const choices = codeChoices(choicesOfCode(asked as Readonly<Record<string, unknown>>));
  return { ...memory, choices: { ...memory?.choices, ...choices } };
}

/** Feature: codegen.show — Go to's **Code**: the active collection tab shows its Code section. */
export function plan(context: Context, answers: Answers): Outcome {
  const tab = activeTabOf(context.state.tabs);
  const empty = { danger: noDanger, undo: { cannot: text.nothingRecorded }, publishes: false, after: [] };
  if (tab?.shows.kind !== 'collection') {
    return run({ title: text.section, steps: [], ...empty });
  }
  const { collection } = tab.shows;
  const memory = keptMemory(tab.memory, answers);
  return run({
    title: text.show.plan(collection),
    steps: [
      {
        kind: 'app',
        text: text.show.step(collection),
        action: 'tab.activate',
        args: { tab: tab.id, section: codeSection, ...(memory === undefined ? {} : { memory: memory as Json }) },
      },
    ],
    ...empty,
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('codegen.show'), plan };
