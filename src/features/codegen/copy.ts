/**
 * Feature: codegen.copy
 *
 * Copies the code the Code section shows, exactly as shown: in the language chosen, with its line breaks, its tabs
 * in Go and one line break at the end. It changes only the clipboard.
 */
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { startArgs } from '../nav/types';
import { text } from './text';
import { codeLanguages, languageLabel, type CodeLanguage } from './types';

/** The app action that puts a text on the clipboard. */
export const copyAction = 'nav.copy';

/** What **Copy** is started with: the code shown, its language, and the collection of the tab. */
export interface CopyArgs {
  readonly code: string;
  readonly language: CodeLanguage;
  readonly collection: string;
}

function copyArgs(answers: Answers): CopyArgs | undefined {
  const { code, language, collection } = startArgs(answers);
  const known = codeLanguages.find((each) => each.language === language)?.language;
  return typeof code === 'string' && code !== '' && typeof collection === 'string' && known !== undefined
    ? { code, language: known, collection }
    : undefined;
}

/** Feature: codegen.copy — the code shown, to the clipboard; nothing when the section shows no code. */
export function plan(_context: Context, answers: Answers): Outcome {
  const args = copyArgs(answers);
  const base = { title: text.copyPlan, danger: noDanger, undo: { cannot: text.nothingRecorded }, publishes: false };
  if (args === undefined) {
    return run({ ...base, steps: [], after: [] });
  }
  return run({
    ...base,
    steps: [
      {
        kind: 'app',
        text: text.copyStep(languageLabel(args.language), args.collection),
        action: copyAction,
        args: { text: args.code },
      },
    ],
    after: [{ kind: 'notify', level: 'success', text: text.copied }],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('codegen.copy'), plan };
