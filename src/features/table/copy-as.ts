/**
 * Feature: table.copy-as
 *
 * Copies the document of a row, or the selected documents, to the clipboard in one of several formats, to paste them
 * into a query, a playground, the insert dialog, a file or another tool. It writes nothing.
 */
import type { Json } from '../../shared/engine-request';
import { ask, run, type Answers, type Context, type Outcome } from '../../shared/feature';
import type { Question } from '../../shared/question';
import { isSubdocument } from '../query/mongosh/ejson';
import { copyFormats, copyText, oneDocumentFormats, severalDocumentsFormats, type CopyFormat } from './copy-text';
import { text } from './text';
import { startArgs, tablePlan, textOf, type ColumnNode, type Document } from './types';

function isFormat(value: unknown): value is CopyFormat {
  return typeof value === 'string' && (copyFormats as readonly string[]).includes(value);
}

/** The formats offered for a number of documents, with their labels and descriptions, in the order of the menu. */
export function formatsFor(
  count: number,
): readonly { readonly format: CopyFormat; readonly label: string; readonly description: string }[] {
  if (count > 1) {
    return severalDocumentsFormats.map((format) => ({ format, ...text.formats.several[format] }));
  }
  return oneDocumentFormats.map((format) => ({ format, ...text.formats.one[format as keyof typeof text.formats.one] }));
}

function formatQuestion(count: number): Question {
  return {
    title: text.formats.title,
    button: text.formats.copy,
    fields: [
      {
        kind: 'pick-one',
        key: 'format',
        label: text.formats.title,
        choices: formatsFor(count).map((each) => ({
          value: each.format,
          label: each.label,
          description: each.description,
        })),
      },
    ],
  };
}

/**
 * Feature: table.copy-as
 *
 * No step: the text of `table.copy-text` goes to the clipboard. `args.documents` are the documents in the order of the
 * table, `args.format` the format chosen (asked when absent, from Go to), `args.collection` the collection's name and
 * `args.columns` the columns drawn, for CSV.
 */
export function plan(_context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const documents = (Array.isArray(args['documents']) ? args['documents'] : []).filter((each: Json): each is Document =>
    isSubdocument(each),
  );
  const chosen = answers['format'] ?? args['format'];
  if (!isFormat(chosen)) {
    return ask(formatQuestion(documents.length));
  }
  const columns = (Array.isArray(args['columns']) ? args['columns'] : []) as unknown as readonly ColumnNode[];
  const copied = copyText(documents, chosen, textOf(args, 'collection'), columns);
  return run(tablePlan(text.plans.copyAs, [], [{ kind: 'copy', text: copied }]));
}
