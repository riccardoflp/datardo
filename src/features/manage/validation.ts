/**
 * Feature: manage.validation
 *
 * The Validation section of a collection's tab: the validator, the validation level and the validation action in an
 * editor, where they are changed and saved (`manage.edit-validation`). For a collection without rules, a random sample
 * of 1,000 documents is read, summarized by `schema.analyze`, and turned into a `$jsonSchema` proposed in the editor
 * (`manage.generate-json-schema`). `view` says what the section shows and whether the sample is to be read; `plan` is
 * what **Edit validation rules…** starts.
 */
import type { MongoRequest } from '../../shared/engine-request';
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appPlan } from '../nav/types';
import {
  editorView,
  openSection,
  otherKind,
  reloadOnly,
  type OptionsRead,
  type RefusedSave,
  type SectionView,
} from './definition';
import { jsonSchema, type SampleSummary } from './generate-json-schema';
import { isNoRules, validationRules } from './read-options';
import { text } from './text';
import { editorText, knownPlace, mongoRequest, namespaceOf, pickCollection, placeOf } from './types';

/** The section's name, as `tab.open` and `tab.activate` take it. */
export const validationSection = 'validation';

/** How many documents are sampled to propose rules. */
export const sampleSize = 1000;

/** How long the sample may take, in ms (the card's 60 seconds). */
export const sampleTimeLimitMs = 60_000;

/** The sample read for a collection without rules: `db.orders.aggregate([{ $sample: { size: 1000 } }])`. */
export function sampleRequest(database: string, collection: string): MongoRequest {
  return {
    ...mongoRequest({ database, collection }, 'aggregate', [[{ $sample: { size: sampleSize } }]]),
    timeLimitMs: sampleTimeLimitMs,
  };
}

/** The sample of a collection without rules, as `schema.analyze` summarized it. */
export type SampleRead =
  | { readonly kind: 'reading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'read'; readonly summary: SampleSummary };

/** What the Validation section is drawn from. */
export interface ValidationState {
  readonly database: string;
  readonly collection: string;
  readonly readOnly: boolean;
  readonly read: OptionsRead;
  /** Absent while it was not asked for. */
  readonly sample?: SampleRead;
  readonly typed?: string;
  readonly refused?: RefusedSave;
}

/** What the Validation section shows, and whether the sample is to be read now. */
export interface ValidationView extends SectionView {
  readonly readSample: boolean;
}

/** Feature: manage.validation — the rules generated from a summary, as the editor shows them. */
export function generatedText(summary: SampleSummary): string {
  return editorText({
    validator: { $jsonSchema: jsonSchema(summary) },
    validationLevel: 'strict',
    validationAction: 'error',
  });
}

const elements = { toolbar: 'manage.edit-validation@toolbar', editor: 'manage.edit-validation@editor' } as const;

function ready(state: ValidationState, read: string, initial: string, note?: string): ValidationView {
  return {
    state: 'ready',
    readSample: false,
    ...editorView({
      readOnly: state.readOnly,
      read,
      initial,
      ...(state.typed === undefined ? {} : { typed: state.typed }),
      ...(state.refused === undefined ? {} : { refused: state.refused }),
      elements,
      discardTitle: text.section.discardRulesTitle(namespaceOf(state.database, state.collection)),
    }),
    ...(note === undefined ? {} : { note }),
  };
}

/** The section of a collection without rules: read-only, sampling, or with the rules generated. */
function withoutRules(state: ValidationState, read: string): ValidationView {
  const { sample } = state;
  if (state.readOnly) {
    return ready(state, read, read, text.section.noRules(state.collection));
  }
  if (sample === undefined || sample.kind === 'reading') {
    const message = text.section.sampling(sampleSize);
    return { state: 'loading', message, toolbar: reloadOnly, readSample: sample === undefined };
  }
  if (sample.kind === 'error' || sample.summary.analyzed === 0) {
    return ready(state, read, read, sample.kind === 'error' ? text.section.noRules(state.collection) : undefined);
  }
  const note = text.section.generated(state.collection, sample.summary.analyzed);
  return ready(state, read, generatedText(sample.summary), note);
}

/** Feature: manage.validation — what the Validation section shows. */
export function view(state: ValidationState): ValidationView {
  const { read } = state;
  switch (read.kind) {
    case 'loading':
      return { state: 'loading', message: text.section.loading, toolbar: reloadOnly, readSample: false };
    case 'error':
      return { state: 'error', message: read.message, toolbar: reloadOnly, readSample: false };
    case 'read':
      break;
  }
  if (read.options.kind === 'not-found') {
    const message = text.section.collectionGone(namespaceOf(state.database, state.collection));
    return { state: 'gone', message, toolbar: reloadOnly, readSample: false };
  }
  const rules = validationRules(read.options.options);
  const readText = editorText({ ...rules });
  return isNoRules(rules.validator) ? withoutRules(state, readText) : ready(state, readText, readText);
}

/** Feature: manage.validation — **Edit validation rules…**: the collection's tab opens on its Validation section. */
export function plan(context: Context, answers: Answers): Outcome {
  const started = placeOf(context, answers);
  if (started === undefined) {
    throw new Error('manage.validation needs a connection.');
  }
  const onCollection = otherKind(started, true);
  const picking = pickCollection(onCollection, answers, text.section.pickCollection, ['collection', 'timeseries']);
  if (picking !== undefined) {
    return picking;
  }
  const place = knownPlace(onCollection);
  const title = text.section.validationTitle(namespaceOf(place.database, place.collection));
  return run(appPlan(title, [], [openSection(place, validationSection, false)]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('manage.validation'), plan };
