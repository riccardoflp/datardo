/**
 * Feature: codegen.show
 *
 * The Code section: the code of the query in the query bar, of the pipeline, or of a chart, in the language chosen,
 * as the lines of the query or as a full program. Nothing is sent to a server. `view` says what the section shows
 * from its state; `plan` is what Go to starts: the active collection tab shows its Code section.
 */
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { activeTabOf } from '../../shared/state/tabs';
import type { CodeResult } from './source';
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

/** Feature: codegen.show — Go to's **Code**: the active collection tab shows its Code section. */
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
        args: { tab: tab.id, section: codeSection },
      },
    ],
    ...empty,
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('codegen.show'), plan };
