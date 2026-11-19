/**
 * `runner.ask`: a question of a feature in the dialog of `nav.dialog`, drawn from what `src/features/runner/ask.ts`
 * returns: a line of text, a list to pick one or many from, or a form of several.
 */
import { useState } from 'react';
import { answersOf, initialValues, view, type FieldValue, type FieldView } from '../../features/runner/ask';
import { runnerText } from '../../features/runner/text';
import type { Answers } from '../../shared/feature';
import type { Question } from '../../shared/question';
import { autoFocusAttribute, Dialog, DialogButton } from '../shell/dialog';
import { ChoiceList } from './choice-list';
import styles from './runner.module.css';

/** What the dialog is given: the question, and where the answer goes; `undefined` cancels. */
export interface QuestionDialogProps {
  readonly question: Question;
  readonly kind: 'form' | 'pick';
  readonly onAnswer: (answers: Answers | undefined) => void;
}

/** The dialog of a question. */
export function QuestionDialog({ question, kind, onAnswer }: QuestionDialogProps): React.JSX.Element {
  const [values, setValues] = useState(() => initialValues(question));
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({});
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const shown = view({ question, values, filters, touched });
  const answer = (): void => {
    setTouched(new Set(question.fields.map((field) => field.key)));
    if (shown.buttonEnabled) {
      onAnswer(answersOf(question, values));
    }
  };
  const change = (key: string, value: FieldValue): void => {
    setValues({ ...values, [key]: value });
    setTouched(new Set([...touched, key]));
  };
  return (
    <Dialog
      title={shown.title}
      kind={kind}
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
            {runnerText.cancel}
          </DialogButton>
          <DialogButton
            feature={question.element ?? 'runner.ask@dialog'}
            look="primary"
            disabled={!shown.buttonEnabled}
            onClick={answer}
          >
            {shown.button}
          </DialogButton>
        </>
      }
    >
      <div
        className={styles['form']}
        onKeyDown={(event) => {
          // `Enter` in a field answers with the button that goes on, when what is typed is valid (nav.dialog).
          if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
            event.preventDefault();
            answer();
          }
        }}
      >
        {shown.text === undefined ? null : <p className={styles['text']}>{shown.text}</p>}
        {shown.fields.map((field, index) => (
          <FieldControl
            key={field.field.key}
            shown={field}
            first={index === 0}
            filter={filters[field.field.key] ?? ''}
            onFilter={(text) => {
              setFilters({ ...filters, [field.field.key]: text });
            }}
            onChange={(value) => {
              change(field.field.key, value);
            }}
            onAnswer={answer}
          />
        ))}
      </div>
    </Dialog>
  );
}

interface FieldControlProps {
  readonly shown: FieldView;
  readonly first: boolean;
  readonly filter: string;
  readonly onFilter: (text: string) => void;
  readonly onChange: (value: FieldValue) => void;
  readonly onAnswer: () => void;
}

function FieldControl({ shown, first, filter, onFilter, onChange, onAnswer }: FieldControlProps): React.JSX.Element {
  const { field } = shown;
  const id = `question-${field.key}`;
  if (field.kind === 'text') {
    const problemId = `${id}-problem`;
    return (
      <div className={styles['field']}>
        <label htmlFor={id}>{field.label}</label>
        <input
          id={id}
          className={styles['input']}
          type={field.secret === true ? 'password' : 'text'}
          value={typeof shown.value === 'string' ? shown.value : ''}
          placeholder={field.placeholder}
          aria-invalid={shown.problem !== undefined}
          aria-describedby={shown.problem === undefined ? undefined : problemId}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          {...(first ? { [autoFocusAttribute]: '' } : {})}
        />
        {shown.problem === undefined ? null : (
          <p id={problemId} className={styles['problem']} role="alert">
            {shown.problem}
          </p>
        )}
      </div>
    );
  }
  return (
    <ChoiceList
      shown={shown}
      first={first}
      filter={filter}
      onFilter={onFilter}
      onChange={onChange}
      onAnswer={onAnswer}
    />
  );
}
