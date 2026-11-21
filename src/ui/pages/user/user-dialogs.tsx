/**
 * The dialogs of the user area, drawn from the questions of their features (`runner.ask`): **New user**
 * (`user.create`), **New password for app@shop** (`user.change-password`), **New role** (`user.create-role`) and
 * **Edit reader@shop** (`user.edit-role`). Their password has **Generate** (`user.generate-password@dialog`),
 * **Show** or **Hide**, and **Copy**; their roles are rows of a role, *in* and a database. What the plans would refuse
 * (no name, no password, custom data or privileges that cannot be read) is said in the dialog, which stays open with
 * what was typed.
 *
 * The password is held by the dialog while it is open and answered once (T21, D41); after a name the server already
 * has, **New user** opens again with it, from the window's memory (`user-actions.ts`).
 */
import { useState } from 'react';
import { customDataOf } from '../../../features/user/create';
import { suggestedRoles } from '../../../features/user/role-reference';
import { text } from '../../../features/user/text';
import { isRecord, rolesOf, type Role } from '../../../features/user/types';
import { privilegesOf } from '../../../features/user/write/role-form';
import { runnerText } from '../../../features/runner/text';
import type { Json } from '../../../shared/engine-request';
import type { Answers } from '../../../shared/feature';
import type { Question, TextField } from '../../../shared/question';
import type { AppState } from '../../../shared/state';
import { MongoshEditor } from '../../components/editor/mongosh-editor';
import { Dialog, DialogButton } from '../../shell/dialog';
import { useAppState } from '../../state/store';
import runner from '../../runner/runner.module.css';
import { createAnswered, forgetPasswords, givenPassword } from './user-actions';
import { usersTabOf } from './user-store';
import { LineField, PasswordField, RoleRows, row, type RoleRow } from './user-fields';

/**
 * The time the dialogs read what is typed at, to say whether it can be read: only `ObjectId()` without an argument
 * depends on it, and the plan reads the text again at its own time.
 */
const validatedAt = 0;

/** The features whose questions are drawn here. */
const userDialogs: ReadonlySet<string> = new Set([
  'user.create',
  'user.change-password',
  'user.create-role',
  'user.edit-role',
]);

/** Whether the question of a feature is drawn by a dialog of this area. */
export function isUserDialog(feature: string): boolean {
  return userDialogs.has(feature);
}

function fieldOf(question: Question, key: string): TextField | undefined {
  const field = question.fields.find((each) => each.key === key);
  return field?.kind === 'text' ? field : undefined;
}

function defaultOf(question: Question, key: string): string {
  return fieldOf(question, key)?.default ?? '';
}

function aboutText(question: Question, key: string): string | undefined {
  const about = question.about;
  const value = isRecord(about) ? about[key] : undefined;
  return typeof value === 'string' ? value : undefined;
}

/** The custom roles of the connection, as its Users and roles tabs read them, for the names the rows suggest. */
function customRolesOf(app: AppState, connection: string | undefined): readonly Role[] {
  return app.tabs.tabs.flatMap((tab) => {
    const kept = tab.shows.kind === 'page' && tab.shows.connection === connection ? usersTabOf(tab.id) : undefined;
    return kept === undefined ? [] : kept.roles.items;
  });
}

function rowsAnswer(rows: readonly RoleRow[], database: string): Json {
  return rows
    .filter((each) => each.role.trim() !== '')
    .map((each) => ({ role: each.role.trim(), db: each.db.trim() === '' ? database : each.db.trim() }));
}

/** The frame of the dialogs: **Cancel** and the button that answers; `Enter` in a line answers too. */
function UserDialogFrame(props: {
  readonly question: Question;
  readonly onCancel: () => void;
  readonly onAnswer: () => void;
  readonly children: React.ReactNode;
}) {
  const { question } = props;
  return (
    <Dialog
      title={question.title}
      kind="form"
      onCancel={props.onCancel}
      buttons={
        <>
          <DialogButton feature="runner.ask@dialog" onClick={props.onCancel}>
            {runnerText.cancel}
          </DialogButton>
          <DialogButton feature="runner.ask@dialog" look="primary" onClick={props.onAnswer}>
            {question.button}
          </DialogButton>
        </>
      }
    >
      <div
        className={runner['form']}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
            event.preventDefault();
            props.onAnswer();
          }
        }}
      >
        {question.text === undefined ? null : <p className={runner['text']}>{question.text}</p>}
        {props.children}
      </div>
    </Dialog>
  );
}

interface DialogProps {
  readonly question: Question;
  readonly onAnswer: (answers: Answers | undefined) => void;
}

/** **New user** (`user.create`). */
function CreateUserDialog({ question, onAnswer }: DialogProps) {
  const app = useAppState();
  const failure = aboutText(question, 'failure');
  const suggestions = suggestedRoles(customRolesOf(app, aboutText(question, 'connection')));
  const [name, setName] = useState(() => defaultOf(question, 'name'));
  const [database, setDatabase] = useState(() => defaultOf(question, 'database'));
  const [password, setPassword] = useState(() => (failure === undefined ? '' : givenPassword()));
  const [rows, setRows] = useState<readonly RoleRow[]>(() =>
    rolesOf(defaultOf(question, 'roles'), defaultOf(question, 'database')).map((role) => row(role.role, role.db)),
  );
  const [customData, setCustomData] = useState(() => defaultOf(question, 'customData'));
  const [tried, setTried] = useState(false);
  const parsed = customDataOf(customData, validatedAt);
  const problems = {
    name: name.trim() === '' ? text.create.emptyName : undefined,
    password: password === '' ? text.password.empty : undefined,
    customData: 'problem' in parsed ? parsed.problem : undefined,
  };
  const answer = (): void => {
    setTried(true);
    if (Object.values(problems).some((problem) => problem !== undefined)) {
      return;
    }
    const answers: Answers = { name, database, password, roles: rowsAnswer(rows, database), customData };
    createAnswered(answers);
    onAnswer(answers);
  };
  const cancel = (): void => {
    forgetPasswords();
    onAnswer(undefined);
  };
  const passwordQuestion = fieldOf(question, 'password');
  return (
    <UserDialogFrame question={question} onCancel={cancel} onAnswer={answer}>
      {failure === undefined ? null : (
        <p className={runner['problem']} role="alert">
          {failure}
        </p>
      )}
      <LineField
        label={text.create.name}
        value={name}
        placeholder={text.create.namePlaceholder}
        problem={tried ? problems.name : undefined}
        first
        onChange={setName}
      />
      <LineField label={text.create.database} value={database} note={text.create.databaseNote} onChange={setDatabase} />
      {passwordQuestion === undefined ? null : (
        <PasswordField
          field={passwordQuestion}
          value={password}
          problem={tried ? problems.password : undefined}
          onChange={setPassword}
        />
      )}
      <RoleRows
        label={text.create.roles}
        rows={rows}
        database={database}
        suggestions={suggestions}
        onChange={setRows}
      />
      <LineField
        label={text.create.customData}
        value={customData}
        placeholder={text.create.customDataPlaceholder}
        problem={tried ? problems.customData : undefined}
        onChange={setCustomData}
      />
    </UserDialogFrame>
  );
}

/** **New password for app@shop** (`user.change-password`). */
function ChangePasswordDialog({ question, onAnswer }: DialogProps) {
  const [password, setPassword] = useState('');
  const [tried, setTried] = useState(false);
  const problem = password === '' ? text.password.empty : undefined;
  const field = fieldOf(question, 'password');
  const answer = (): void => {
    setTried(true);
    if (problem === undefined) {
      onAnswer({ password });
    }
  };
  return (
    <UserDialogFrame
      question={question}
      onCancel={() => {
        onAnswer(undefined);
      }}
      onAnswer={answer}
    >
      {field === undefined ? null : (
        <PasswordField
          field={field}
          value={password}
          problem={tried ? problem : undefined}
          first
          onChange={setPassword}
        />
      )}
    </UserDialogFrame>
  );
}

/** The lines the editor of **Privileges** shows before it scrolls. */
const privilegesLines = 8;
const lineHeightPx = 20;

/** **New role** (`user.create-role`) and **Edit reader@shop** (`user.edit-role`), whose name and database are fixed. */
function RoleDialog({ question, onAnswer, editing }: DialogProps & { readonly editing: boolean }) {
  const app = useAppState();
  const suggestions = suggestedRoles(customRolesOf(app, aboutText(question, 'connection')));
  const [name, setName] = useState(() => defaultOf(question, 'name'));
  const [database, setDatabase] = useState(() => defaultOf(question, 'database'));
  const [privileges, setPrivileges] = useState(() => defaultOf(question, 'privileges'));
  const [rows, setRows] = useState<readonly RoleRow[]>(() =>
    rolesOf(defaultOf(question, 'inherits'), defaultOf(question, 'database')).map((role) => row(role.role, role.db)),
  );
  const [tried, setTried] = useState(false);
  const typed = privilegesOf(privileges, validatedAt);
  const problems = {
    name: name.trim() === '' ? text.createRole.emptyName : undefined,
    privileges: typed.kind === 'problem' ? typed.message : undefined,
  };
  const answer = (): void => {
    setTried(true);
    if (problems.name === undefined && problems.privileges === undefined) {
      onAnswer({ name, database, privileges, inherits: rowsAnswer(rows, database) });
    }
  };
  return (
    <UserDialogFrame
      question={question}
      onCancel={() => {
        onAnswer(undefined);
      }}
      onAnswer={answer}
    >
      <LineField
        label={text.createRole.name}
        value={name}
        placeholder={text.createRole.namePlaceholder}
        problem={tried ? problems.name : undefined}
        readOnly={editing}
        first={!editing}
        onChange={setName}
      />
      <LineField
        label={text.createRole.database}
        value={database}
        note={text.createRole.databaseNote}
        readOnly={editing}
        onChange={setDatabase}
      />
      <div className={runner['field']}>
        <span>{text.createRole.privileges}</span>
        <MongoshEditor
          label={text.createRole.privileges}
          field="privileges"
          placeholder={text.createRole.privilegesExample}
          text={privileges}
          kind="document"
          fields={[]}
          multiline
          maxHeight={privilegesLines * lineHeightPx}
          invalid={tried && problems.privileges !== undefined}
          {...(editing ? { focusRequest: 1 } : {})}
          onChange={setPrivileges}
          onRun={answer}
        />
        <p className={runner['muted']}>{text.createRole.privilegesNote}</p>
        {!tried || problems.privileges === undefined ? null : (
          <p className={runner['problem']} role="alert">
            {problems.privileges}
          </p>
        )}
      </div>
      <RoleRows
        label={text.createRole.inherits}
        rows={rows}
        database={database}
        suggestions={suggestions}
        onChange={setRows}
      />
    </UserDialogFrame>
  );
}

/** The dialog of a question of this area. */
export function UserDialog(props: DialogProps & { readonly feature: string }): React.JSX.Element {
  switch (props.feature) {
    case 'user.create':
      return <CreateUserDialog question={props.question} onAnswer={props.onAnswer} />;
    case 'user.change-password':
      return <ChangePasswordDialog question={props.question} onAnswer={props.onAnswer} />;
    default:
      return (
        <RoleDialog question={props.question} onAnswer={props.onAnswer} editing={props.feature === 'user.edit-role'} />
      );
  }
}
