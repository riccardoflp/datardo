/**
 * The controls of the connection form (`connection.form`): a text field, a checkbox and a list, each drawn from its
 * `FieldView`, with its label, its placeholder, its hint, its mark and **Browse…** beside a file.
 */
import { useId } from 'react';
import type { ChoiceView, FieldName, FieldView } from '../../../features/connection/form';
import styles from './connection-pages.module.css';

/** What every control is given: its name, and how it is shown (absent: not shown). */
interface ControlProps {
  readonly name: FieldName;
  readonly field: FieldView | undefined;
}

function Hint({ id, field }: { readonly id: string; readonly field: FieldView }): React.JSX.Element | null {
  return field.hint === undefined ? null : (
    <p id={id} className={styles['hint']}>
      {field.hint}
    </p>
  );
}

/** A text field, or a password field; `Enter` saves. */
export function TextField(
  props: ControlProps & {
    readonly value: string;
    readonly secret?: boolean;
    readonly onChange: (value: string) => void;
    readonly onEnter: () => void;
    readonly onBlur?: () => void;
    readonly onBrowse?: () => void;
    /** The id of a `datalist` the field offers. */
    readonly list?: string;
  },
): React.JSX.Element | null {
  const id = useId();
  const field = props.field;
  if (field === undefined) {
    return null;
  }
  return (
    <div className={styles['field']}>
      <label htmlFor={id} className={styles['label']}>
        {field.label}
      </label>
      <div className={styles['row']}>
        <input
          id={id}
          className={styles['input']}
          type={props.secret === true ? 'password' : 'text'}
          autoComplete="off"
          spellCheck={false}
          list={props.list}
          value={props.value}
          placeholder={field.placeholder}
          disabled={field.disabled}
          data-field={props.name}
          data-feature={field.element}
          aria-invalid={field.marked ? true : undefined}
          aria-describedby={field.hint === undefined ? undefined : `${id}-hint`}
          onChange={(event) => {
            props.onChange(event.target.value);
          }}
          onBlur={props.onBlur}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              props.onEnter();
            }
          }}
        />
        {field.browse === undefined || props.onBrowse === undefined ? null : (
          <button type="button" className={styles['button']} disabled={field.disabled} onClick={props.onBrowse}>
            {field.browse.label}
          </button>
        )}
      </div>
      <Hint id={`${id}-hint`} field={field} />
    </div>
  );
}

/** A checkbox, with its hint under it. */
export function CheckField(
  props: ControlProps & { readonly checked: boolean; readonly onChange: (checked: boolean) => void },
): React.JSX.Element | null {
  const id = useId();
  const field = props.field;
  if (field === undefined) {
    return null;
  }
  return (
    <div className={styles['field']}>
      <label className={styles['check']}>
        <input
          type="checkbox"
          checked={props.checked}
          disabled={field.disabled}
          data-field={props.name}
          data-feature={field.element}
          aria-describedby={field.hint === undefined ? undefined : `${id}-hint`}
          onChange={(event) => {
            props.onChange(event.target.checked);
          }}
        />
        <span>{field.label}</span>
      </label>
      <Hint id={`${id}-hint`} field={field} />
    </div>
  );
}

/** A list to choose from. */
export function ChoiceField(
  props: ControlProps & {
    readonly value: string;
    readonly choices: readonly ChoiceView[];
    readonly onChange: (value: string) => void;
  },
): React.JSX.Element | null {
  const id = useId();
  const field = props.field;
  if (field === undefined) {
    return null;
  }
  return (
    <div className={styles['field']}>
      <label htmlFor={id} className={styles['label']}>
        {field.label}
      </label>
      <select
        id={id}
        className={styles['input']}
        value={props.value}
        disabled={field.disabled}
        data-field={props.name}
        data-feature={field.element}
        aria-invalid={field.marked ? true : undefined}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      >
        {field.placeholder === undefined ? null : <option value="">{field.placeholder}</option>}
        {props.choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}
