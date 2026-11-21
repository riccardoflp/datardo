/**
 * The form **Add an entry to events** of `value.add-entry`, a question of the runner that this dialog draws: **ID**
 * (`*` at first), and one or more rows of **Field** and **Value**, each typed as text, JSON or hexadecimal, with **Add a
 * field** for another row. **Add a copy…** opens it with the pairs of an entry, which the question's `about` carries.
 * It answers `{ id, pairs }`, each part `{ text, format }`; the feature reads them and refuses what it cannot read.
 */
import { useState } from 'react';
import type { Format } from '../../../features/value/format';
import { fieldsOf } from '../../../features/value/types';
import type { Answers } from '../../../shared/feature';
import type { Question } from '../../../shared/question';
import { Dialog, DialogButton } from '../../shell/dialog';
import styles from './value.module.css';

/** A part of a pair as typed: its text and its format. */
interface Typed {
  readonly text: string;
  readonly format: Format;
}

/** A row of the form. */
interface Pair {
  readonly field: Typed;
  readonly value: Typed;
}

const empty: Pair = { field: { text: '', format: 'text' }, value: { text: '', format: 'text' } };

function typedOf(value: unknown): Typed {
  const fields = fieldsOf(value);
  const format = fields['format'] === 'json' || fields['format'] === 'hex' ? fields['format'] : 'text';
  return { text: typeof fields['text'] === 'string' ? fields['text'] : '', format };
}

/** The pairs the question's `about` carries: those of the entry copied, or none. */
function pairsOf(question: Question): readonly Pair[] {
  const pairs = fieldsOf(question.about)['pairs'];
  return Array.isArray(pairs)
    ? (pairs as readonly unknown[]).map((pair) => ({
        field: typedOf(fieldsOf(pair)['field']),
        value: typedOf(fieldsOf(pair)['value']),
      }))
    : [];
}

/** Whether a question is the form of `value.add-entry`, which this dialog draws. */
export function isEntryForm(question: Question): boolean {
  return fieldsOf(question.about)['form'] === 'value.add-entry';
}

function TypedInput(props: {
  readonly label: string;
  readonly typed: Typed;
  readonly change: (typed: Typed) => void;
  readonly autoFocus: boolean;
}) {
  const { label, typed, change } = props;
  return (
    <>
      <input
        type="text"
        className={styles['input']}
        aria-label={label}
        {...(props.autoFocus ? { 'data-autofocus': '' } : {})}
        value={typed.text}
        onChange={(event) => {
          change({ ...typed, text: event.target.value });
        }}
      />
      <select
        className={styles['input']}
        aria-label={`${label} as`}
        value={typed.format}
        onChange={(event) => {
          const format = event.target.value === 'json' || event.target.value === 'hex' ? event.target.value : 'text';
          change({ ...typed, format });
        }}
      >
        <option value="text">Text</option>
        <option value="json">JSON</option>
        <option value="hex">Hex</option>
      </select>
    </>
  );
}

/** The dialog of the form; `undefined` cancels. */
export function EntryForm(props: {
  readonly question: Question;
  readonly onAnswer: (answers: Answers | undefined) => void;
}): React.JSX.Element {
  const { question, onAnswer } = props;
  const [id, setId] = useState(question.fields.find((field) => field.key === 'id')?.default ?? '*');
  const [pairs, setPairs] = useState<readonly Pair[]>(() => {
    const copied = pairsOf(question);
    return copied.length === 0 ? [empty] : copied;
  });
  const changePair = (index: number, pair: Pair): void => {
    setPairs(pairs.map((each, at) => (at === index ? pair : each)));
  };
  const buttons = (
    <>
      <DialogButton
        feature="runner.ask@dialog"
        onClick={() => {
          onAnswer(undefined);
        }}
      >
        Cancel
      </DialogButton>
      <DialogButton
        feature="runner.ask@dialog"
        look="primary"
        onClick={() => {
          onAnswer({ id, pairs: pairs.map((pair) => ({ field: { ...pair.field }, value: { ...pair.value } })) });
        }}
      >
        {question.button}
      </DialogButton>
    </>
  );
  return (
    <Dialog
      title={question.title}
      kind="form"
      onCancel={() => {
        onAnswer(undefined);
      }}
      buttons={buttons}
    >
      <div className={styles['entry-form']}>
        <label className={styles['entry-id']}>
          ID{' '}
          <input
            type="text"
            className={styles['input']}
            value={id}
            onChange={(event) => {
              setId(event.target.value);
            }}
          />
        </label>
        {pairs.map((pair, index) => (
          <div
            key={String(index)}
            className={styles['entry-pair']}
            role="group"
            aria-label={`Pair ${String(index + 1)}`}
          >
            <TypedInput
              label={`Field ${String(index + 1)}`}
              typed={pair.field}
              autoFocus={index === 0}
              change={(field) => {
                changePair(index, { ...pair, field });
              }}
            />
            <TypedInput
              label={`Value ${String(index + 1)}`}
              typed={pair.value}
              autoFocus={false}
              change={(value) => {
                changePair(index, { ...pair, value });
              }}
            />
          </div>
        ))}
        <div className={styles['buttons']}>
          <button
            type="button"
            className={styles['button']}
            onClick={() => {
              setPairs([...pairs, empty]);
            }}
          >
            Add a field
          </button>
        </div>
      </div>
    </Dialog>
  );
}
