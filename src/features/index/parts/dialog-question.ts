/**
 * The questions `index.create` and `index.edit` ask through the index dialog (`index.dialog`), and what the window
 * draws the dialog with: the collection, the definition it opens on, the index being changed, and the indexes read for
 * the note (`index.list`). A generic form shows the same question as its **Text**: the keys and the options.
 */
import type { Json } from '../../../shared/engine-request';
import type { Question } from '../../../shared/question';
import { openDialog, textOf, type IndexDialogState } from '../dialog';
import type { EditedSearchIndex } from '../search-dialog';
import { text } from '../text';
import { emptyInput, isDocument, type IndexDefinition, type IndexList } from '../types';

/** What the window draws the index dialog of a question with. */
export interface DialogAbout {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
  /** The definition the dialog opens on: suggested keys, a copy, or the index being changed. */
  readonly definition?: IndexDefinition;
  /** The name of the index being changed; absent when creating one. */
  readonly editing?: string;
  readonly list?: IndexList;
}

/** The question of the index dialog, drawn by the window from `about` (`index.dialog@dialog`). */
export function dialogQuestion(
  title: string,
  button: string,
  definition?: IndexDefinition,
  about?: DialogAbout,
): Question {
  const inputs = definition === undefined ? { keys: emptyInput, options: emptyInput } : textOf(definition);
  return {
    title,
    button,
    element: 'index.dialog@dialog',
    ...(about === undefined ? {} : { about: about as unknown as Json }),
    fields: [
      {
        kind: 'text',
        key: 'keys',
        label: text.dialog.keys,
        default: inputs.keys.text,
        placeholder: text.dialog.keysPlaceholder,
      },
      {
        kind: 'text',
        key: 'options',
        label: text.dialog.options,
        default: inputs.options.text,
        placeholder: text.dialog.optionsPlaceholder,
      },
    ],
  };
}

/** What a question gave the window to draw the index dialog; `undefined` when it is not this dialog's. */
export function dialogAboutOf(question: Question): DialogAbout | undefined {
  const about = question.about;
  if (question.element !== 'index.dialog@dialog' || !isDocument(about)) {
    return undefined;
  }
  const { connection, database, collection } = about;
  return typeof connection === 'string' && typeof database === 'string' && typeof collection === 'string'
    ? (about as unknown as DialogAbout)
    : undefined;
}

/** What the window draws the search index dialog of a question with. */
export interface SearchDialogAbout {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
  readonly editing?: EditedSearchIndex;
}

/** What a question gave the window to draw the search index dialog; `undefined` when it is not this dialog's. */
export function searchDialogAboutOf(question: Question): SearchDialogAbout | undefined {
  const about = question.about;
  if (question.element !== 'index.search-dialog@dialog' || !isDocument(about)) {
    return undefined;
  }
  const { connection, database, collection } = about;
  return typeof connection === 'string' && typeof database === 'string' && typeof collection === 'string'
    ? (about as unknown as SearchDialogAbout)
    : undefined;
}

/** The dialog a question opens: on the definition it was given, or on the index being changed. */
export function dialogOfQuestion(about: DialogAbout): IndexDialogState {
  const definition = about.definition ?? { keys: {}, options: {} };
  return openDialog({
    collection: about.collection,
    ...(about.editing === undefined ? { definition } : { editing: { name: about.editing, definition } }),
    ...(about.list === undefined ? {} : { list: about.list }),
  });
}
