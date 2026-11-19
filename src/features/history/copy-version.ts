/**
 * Feature: history.copy-version
 *
 * Copies the document as it was in an exact version, in mongosh syntax on several lines (`query.format`), ready for the
 * insert dialog: `ObjectId("…")`, `ISODate("…")` and `NumberLong(…)` as its types need. A partial version cannot be
 * copied, since its unknown values have no text, nor a version without a document. It writes nothing.
 *
 * Started with `{ document, state }`: the version's document as canonical Extended JSON, and its state.
 */
import type { Json } from '../../shared/engine-request';
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { formattedValue, prettyWidth } from '../aggregate/mongosh/format';
import { copyText } from './text';
import { isRecord, objectOf } from './types';

/** The text a version is copied as: its document in mongosh syntax on several lines. */
export function versionText(document: Json): string {
  return formattedValue(document, { kind: 'pretty', width: prettyWidth });
}

/** Feature: history.copy-version — no step; what follows copies the document of an exact version. */
export function plan(_context: Context, answers: Answers): Outcome {
  const args = objectOf(answers['args'] as Json | undefined);
  const document = args['document'];
  const copies = args['state'] === 'exact' && isRecord(document);
  return run({
    title: copyText.title,
    steps: [],
    danger: noDanger,
    undo: { cannot: copyText.cannotUndo },
    publishes: false,
    after: copies
      ? [
          { kind: 'copy', text: versionText(document) },
          { kind: 'notify', level: 'success', text: copyText.copied },
        ]
      : [],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('history.copy-version'), plan };
