/**
 * The insert dialog **Insert into people** (`document.insert`, `@dialog`): an editor of mongosh text or Extended
 * JSON that completes field names, the count of documents it holds a quarter of a second after the last key (or the
 * reader's error), the line of `undo.note` when the insert will not be recorded, **Template**, **Open in a tab**,
 * **Keep open**, **Cancel** and **Insert** (`Ctrl+Enter`). Closed without inserting, it keeps its text for the next
 * time.
 */
import { useState } from 'react';
import { insertedKept } from '../../../features/document/insert';
import { templateText } from '../../../features/document/insert-template';
import { documentsOfText, type InsertDocuments } from '../../../features/document/parse-insert-text';
import { text } from '../../../features/document/text';
import type { FieldHint } from '../../../features/query/field-hints';
import { undoNoteOf } from '../../../features/document/write/undo-note';
import type { Answers } from '../../../shared/feature';
import { connectionId } from '../../../shared/ids';
import type { Question } from '../../../shared/question';
import { MongoshEditor } from '../../components/editor/mongosh-editor';
import { Dialog, DialogButton } from '../../shell/dialog';
import { startFeature } from '../../shell/intent';
import { currentAppState, useAppState } from '../../state/store';
import { placeOfCollection } from './document-actions';
import { leaveText, leftText, nextNewDocument, textSent, type DialogCollection } from './insert-memory';
import { dialogAbout, useCounted } from './dialog-parts';
import styles from './document.module.css';

/** What the dialog is given. */
export interface InsertDialogProps {
  readonly question: Question;
  readonly onAnswer: (answers: Answers | undefined) => void;
}

const quarterSecondMs = 250;

function read(source: string): InsertDocuments {
  return documentsOfText(source, { now: Date.now(), newId: () => '000000000000000000000000' });
}

async function template(where: DialogCollection): Promise<string> {
  const result = await window.datardo.start({
    feature: 'query.field-hints' as never,
    target: { kind: 'collection', ...where, connection: connectionId(where.connection) },
    args: { ...where },
  });
  const fields = result.kind === 'read' ? (result.result as readonly FieldHint[]) : [];
  return templateText(fields.map((field) => ({ path: field.path, types: field.types, share: field.ratio })));
}

function openInTab(where: DialogCollection, typed: string): void {
  const number = nextNewDocument(currentAppState());
  startFeature('tab.open', {
    place: 'dialog',
    args: {
      shows: { kind: 'document', ...where, id: text.open.newDocument(number), newDocument: number },
      draft: { text: typed },
    },
  });
}

function useUndoLine(where: DialogCollection, count: number): string | undefined {
  const state = useAppState();
  const place = placeOfCollection(state, { ...where, connection: connectionId(where.connection) }, false);
  const note = undoNoteOf(place, state.settings, { ...insertedKept(place, []), count });
  return note.recorded ? undefined : note.line;
}

/** The insert dialog. */
export function InsertDialog({ question, onAnswer }: InsertDialogProps): React.JSX.Element {
  const about = dialogAbout(question);
  const where: DialogCollection = {
    connection: about.text('connection'),
    database: about.text('database'),
    collection: about.text('collection'),
  };
  const given = question.fields[0]?.kind === 'text' ? (question.fields[0].default ?? '') : '';
  const [typed, setTyped] = useState(() => (given === '' ? (leftText(where) ?? '') : given));
  const [keepOpen, setKeepOpen] = useState(about.flag('keepOpen'));
  const counted = useCounted(typed, read, quarterSecondMs);
  const count = counted?.ok === true ? counted.documents.length : 0;
  const undoLine = useUndoLine(where, count);
  const insert = (): void => {
    if (read(typed).ok) {
      textSent(where, typed, currentAppState());
      onAnswer({ documents: typed, keepOpen });
    }
  };
  const cancel = (): void => {
    leaveText(where, typed);
    onAnswer(undefined);
  };
  const problem = about.optional('problem');
  const line = counted === undefined ? undefined : counted.ok ? text.insert.toInsert(count) : counted.message;
  return (
    <Dialog
      title={question.title}
      kind="form"
      onCancel={cancel}
      buttons={
        <Buttons
          {...{ where, typed, count, keepOpen, setKeepOpen, insert, cancel, onAnswer, valid: counted?.ok !== false }}
        />
      }
    >
      <div
        className={styles['form']}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            insert();
          }
        }}
      >
        <p
          className={problem === undefined ? styles['hint'] : styles['problem']}
          role={problem === undefined ? undefined : 'alert'}
        >
          {problem ?? text.insert.hint}
        </p>
        <MongoshEditor
          label={question.title}
          field="documents"
          placeholder=""
          text={typed}
          kind="document"
          fields={[]}
          multiline
          maxHeight={320}
          invalid={counted?.ok === false}
          focusRequest={1}
          onChange={setTyped}
          onRun={insert}
        />
        <p className={styles['note']} role="status">
          {line}
          {undoLine === undefined ? null : (
            <>
              <br />
              {undoLine}
            </>
          )}
        </p>
        {about.optional('result') === undefined ? null : (
          <p className={styles['note']} role="status">
            {about.optional('result')}
          </p>
        )}
        <button
          type="button"
          className={styles['button']}
          title={text.insert.templateTooltip}
          onClick={() => {
            void template(where).then(setTyped);
          }}
        >
          {text.insert.template}
        </button>
      </div>
    </Dialog>
  );
}

interface ButtonsProps {
  readonly where: DialogCollection;
  readonly typed: string;
  readonly count: number;
  readonly keepOpen: boolean;
  readonly setKeepOpen: (keep: boolean) => void;
  readonly insert: () => void;
  readonly cancel: () => void;
  readonly onAnswer: (answers: Answers | undefined) => void;
  readonly valid: boolean;
}

function Buttons(props: ButtonsProps): React.JSX.Element {
  const several = props.count > 1;
  return (
    <>
      <button
        type="button"
        className={styles['button']}
        data-feature="document.open@dialog"
        disabled={several}
        title={several ? text.insert.openInTabSeveral : text.insert.openInTabTooltip}
        onClick={() => {
          openInTab(props.where, props.typed);
          props.onAnswer(undefined);
        }}
      >
        {text.insert.openInTab}
      </button>
      <label className={styles['row']} title={text.insert.keepOpenTooltip}>
        <input
          type="checkbox"
          checked={props.keepOpen}
          onChange={(event) => {
            props.setKeepOpen(event.target.checked);
          }}
        />
        {text.insert.keepOpen}
      </label>
      <DialogButton feature="runner.ask@dialog" onClick={props.cancel}>
        {text.insert.cancel}
      </DialogButton>
      <DialogButton feature="document.insert@dialog" look="primary" disabled={!props.valid} onClick={props.insert}>
        {text.insert.button(props.count)}
      </DialogButton>
    </>
  );
}
