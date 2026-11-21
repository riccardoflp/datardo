/**
 * The form **Update many · orders** (`document.update-many`, `@form`): the filter as written, how many documents it
 * matches, and **Update**, an editor of operators or of a pipeline that completes them. **Continue** (`Ctrl+Enter`)
 * is disabled while nothing matches; the form says why it is asked again.
 */
import { useState } from 'react';
import { text } from '../../../features/document/text';
import type { Answers } from '../../../shared/feature';
import type { Question } from '../../../shared/question';
import { MongoshEditor } from '../../components/editor/mongosh-editor';
import { Dialog, DialogButton } from '../../shell/dialog';
import { dialogAbout } from './dialog-parts';
import styles from './document.module.css';

/** What the form is given. */
export interface UpdateFormProps {
  readonly question: Question;
  readonly onAnswer: (answers: Answers | undefined) => void;
}

/** The form. */
export function UpdateForm({ question, onAnswer }: UpdateFormProps): React.JSX.Element {
  const about = dialogAbout(question);
  const field = question.fields[0];
  const [typed, setTyped] = useState(field?.kind === 'text' ? (field.default ?? '') : '');
  const count = about.number('count');
  const problem = about.optional('problem');
  const proceed = (): void => {
    if (count > 0) {
      onAnswer({ update: typed });
    }
  };
  return (
    <Dialog
      title={question.title}
      kind="form"
      onCancel={() => {
        onAnswer(undefined);
      }}
      buttons={
        <>
          <DialogButton
            feature="runner.ask@dialog"
            onClick={() => {
              onAnswer(undefined);
            }}
          >
            {text.insert.cancel}
          </DialogButton>
          <DialogButton feature="document.update-many@form" look="primary" disabled={count === 0} onClick={proceed}>
            {question.button}
          </DialogButton>
        </>
      }
    >
      <div
        className={styles['form']}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            proceed();
          }
        }}
      >
        <pre className={styles['filter']}>{about.text('filter')}</pre>
        <p className={styles['note']} role="status">
          {text.many.match(count)}
        </p>
        <MongoshEditor
          label={text.updateMany.field}
          field="update"
          placeholder={text.updateMany.placeholder}
          text={typed}
          kind="update"
          fields={[]}
          multiline
          maxHeight={240}
          invalid={problem !== undefined}
          focusRequest={1}
          onChange={setTyped}
          onRun={proceed}
        />
        {problem === undefined ? null : (
          <p className={styles['problem']} role="alert">
            {problem}
          </p>
        )}
      </div>
    </Dialog>
  );
}
