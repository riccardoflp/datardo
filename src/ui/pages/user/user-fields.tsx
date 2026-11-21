/**
 * The fields of the dialogs of the user area: a line of text with its note and its problem, **Password** with
 * **Generate** (`user.generate-password@dialog`), **Show** or **Hide** and **Copy**, and the rows of roles with
 * **+ Role**.
 */
import { useId, useState } from 'react';
import { generatePassword, passwordField } from '../../../features/user/generate-password';
import { databaseForRole } from '../../../features/user/role-reference';
import { text } from '../../../features/user/text';
import type { TextField } from '../../../shared/question';
import { autoFocusAttribute, DialogButton } from '../../shell/dialog';
import runner from '../../runner/runner.module.css';
import own from './user.module.css';

/** A row of roles: a role and the database it is in. */
export interface RoleRow {
  readonly id: number;
  readonly role: string;
  readonly db: string;
}

let rowNumber = 0;

/** A new row, with a number of its own for React. */
export function row(role: string, db: string): RoleRow {
  rowNumber += 1;
  return { id: rowNumber, role, db };
}

/** A field of a line of text, with its note and what is wrong with it. */
export function LineField(props: {
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string | undefined;
  readonly note?: string;
  readonly problem?: string | undefined;
  readonly readOnly?: boolean;
  readonly first?: boolean;
  readonly onChange: (value: string) => void;
}) {
  const id = useId();
  const problem = `${id}-problem`;
  const note = `${id}-note`;
  const described = [props.note === undefined ? '' : note, props.problem === undefined ? '' : problem]
    .filter((each) => each !== '')
    .join(' ');
  return (
    <div className={runner['field']}>
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        className={runner['input']}
        value={props.value}
        placeholder={props.placeholder}
        readOnly={props.readOnly}
        aria-invalid={props.problem !== undefined}
        {...(described === '' ? {} : { 'aria-describedby': described })}
        {...(props.first === true ? { [autoFocusAttribute]: '' } : {})}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
      {props.note === undefined ? null : (
        <p id={note} className={runner['muted']}>
          {props.note}
        </p>
      )}
      {props.problem === undefined ? null : (
        <p id={problem} className={runner['problem']} role="alert">
          {props.problem}
        </p>
      )}
    </div>
  );
}

/** **Password**, hidden as it is typed, with **Generate**, **Show** or **Hide**, and **Copy**. */
export function PasswordField(props: {
  readonly field: TextField;
  readonly value: string;
  readonly problem?: string | undefined;
  readonly first?: boolean;
  readonly onChange: (value: string) => void;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const shown = passwordField(visible);
  const problem = `${id}-problem`;
  return (
    <div className={runner['field']}>
      <label htmlFor={id}>{props.field.label}</label>
      <div className={own['row']}>
        <input
          id={id}
          className={`${runner['input'] ?? ''} ${own['password'] ?? ''}`}
          type={shown.visible ? 'text' : 'password'}
          autoComplete="new-password"
          spellCheck={false}
          value={props.value}
          placeholder={props.field.placeholder}
          aria-invalid={props.problem !== undefined}
          {...(props.problem === undefined ? {} : { 'aria-describedby': problem })}
          {...(props.first === true ? { [autoFocusAttribute]: '' } : {})}
          onChange={(event) => {
            props.onChange(event.target.value);
          }}
        />
        <DialogButton
          feature="user.generate-password@dialog"
          onClick={() => {
            props.onChange(generatePassword((count) => crypto.getRandomValues(new Uint8Array(count))));
            setVisible(true);
          }}
        >
          <span title={text.password.generateTooltip}>{text.password.generate}</span>
        </DialogButton>
        <DialogButton
          onClick={() => {
            setVisible(!visible);
          }}
        >
          {shown.toggle}
        </DialogButton>
        <DialogButton
          onClick={() => {
            void navigator.clipboard.writeText(props.value);
          }}
        >
          {text.password.copy}
        </DialogButton>
      </div>
      {props.problem === undefined ? null : (
        <p id={problem} className={runner['problem']} role="alert">
          {props.problem}
        </p>
      )}
    </div>
  );
}

/** Rows of a role, *in*, a database and `✕`, with **+ Role**; a role that exists only in `admin` moves its row there. */
export function RoleRows(props: {
  readonly label: string;
  readonly rows: readonly RoleRow[];
  readonly database: string;
  readonly suggestions: readonly string[];
  readonly onChange: (rows: readonly RoleRow[]) => void;
}) {
  const list = useId();
  const { rows, onChange } = props;
  const changed = (id: number, change: (each: RoleRow) => RoleRow): void => {
    onChange(rows.map((each) => (each.id === id ? change(each) : each)));
  };
  return (
    <fieldset className={runner['choices']}>
      <legend className={runner['legend']}>{props.label}</legend>
      <datalist id={list}>
        {props.suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {rows.map((each) => (
        <div key={each.id} className={own['row']}>
          <input
            className={runner['input']}
            aria-label={text.window.role}
            placeholder={text.roleRows.placeholder}
            list={list}
            value={each.role}
            onChange={(event) => {
              const role = event.target.value;
              changed(each.id, (was) => ({ ...was, role, db: databaseForRole(role, was.db) }));
            }}
          />
          <span>{text.inspector.in}</span>
          <input
            className={`${runner['input'] ?? ''} ${own['database'] ?? ''}`}
            aria-label={text.window.roleDatabase}
            value={each.db}
            onChange={(event) => {
              const db = event.target.value;
              changed(each.id, (was) => ({ ...was, db }));
            }}
          />
          <DialogButton
            onClick={() => {
              onChange(rows.filter((other) => other.id !== each.id));
            }}
          >
            <span title={text.roleRows.remove} aria-label={text.roleRows.remove}>
              ✕
            </span>
          </DialogButton>
        </div>
      ))}
      <div>
        <DialogButton
          onClick={() => {
            onChange([...rows, row('', props.database)]);
          }}
        >
          <span title={text.roleRows.addTooltip}>{text.roleRows.add}</span>
        </DialogButton>
      </div>
    </fieldset>
  );
}
