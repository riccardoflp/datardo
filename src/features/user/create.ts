/**
 * Feature: user.create
 *
 * Creates a user from the dialog **New user**: one step, `db.getSiblingDB("shop").runCommand({ createUser: "app",
 * pwd: "***", roles: ["readWrite", { role: "clusterMonitor", db: "admin" }], customData: { team: "billing" } })`, sent
 * with the password and written everywhere with `***` (T21, D41). Started with `{ connection, database }`, the database
 * chosen in the page (`null` with **All databases**).
 *
 * The dialog answers `name`, `database`, `password`, `roles` and `customData`. Its **Roles** are rows of a role and a
 * database; they answer as `[{ role, db }]`, or as a text of roles written whole separated by commas, which is also
 * how the question gives the rows it starts with (`readWrite@shop`). Ported from Mongoster's `createUser`,
 * `openUserForm`, `rolePicker` and `passwordField`.
 */
import type { Json } from '../../shared/engine-request';
import {
  ask,
  refuse,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { roleArguments } from './role-reference';
import { text } from './text';
import {
  answerText,
  connectionPlace,
  roleKey,
  rolesOf,
  rolesText,
  userKey,
  type RoleRef,
  type UserPlace,
} from './types';
import { isDocument, valueOfText } from './write/parsed';
import {
  copyPasswordAction,
  copyPasswordPlan,
  passwordAnswer,
  passwordQuestionField,
  passwordToCopy,
} from './write/password';
import { commandStep, notifySuccess, refusedReadOnly, writePlan } from './write/plan';

/** The database the dialog starts with: the one chosen in the page, or `admin` with **All databases**. */
export function startingDatabase(place: UserPlace): string {
  return place.database === '' ? 'admin' : place.database;
}

/** The roles the dialog starts with: `readWrite` in the database chosen in the page, none with **All databases**. */
export function startingRoles(place: UserPlace): readonly RoleRef[] {
  return place.database === '' ? [] : [{ role: 'readWrite', db: place.database }];
}

function userForm(place: UserPlace): Outcome {
  return ask({
    title: text.create.title,
    button: text.create.button,
    fields: [
      {
        kind: 'text',
        key: 'name',
        label: text.create.name,
        placeholder: text.create.namePlaceholder,
        rules: [{ kind: 'not-empty', message: text.create.emptyName }],
      },
      { kind: 'text', key: 'database', label: text.create.database, default: startingDatabase(place) },
      passwordQuestionField,
      { kind: 'text', key: 'roles', label: text.create.roles, default: rolesText(startingRoles(place)) },
      {
        kind: 'text',
        key: 'customData',
        label: text.create.customData,
        placeholder: text.create.customDataPlaceholder,
      },
    ],
  });
}

/** The custom data typed: none when the field is empty, the document, or the message of `/custom-data`. */
export function customDataOf(typed: string, now: number): { readonly value?: Json } | { readonly problem: string } {
  if (typed.trim() === '') {
    return {};
  }
  const parsed = valueOfText(typed, now);
  if (!parsed.ok) {
    return { problem: text.create.customDataError(parsed.error.message) };
  }
  return isDocument(parsed.value) ? { value: parsed.value } : { problem: text.create.customDataNotObject };
}

/** What the command `createUser` is made of. */
export interface NewUser {
  readonly name: string;
  readonly password: string;
  readonly roles: readonly RoleRef[];
  readonly database: string;
  readonly customData?: Json | undefined;
}

/** The command `createUser`, with `customData` only when some was given. */
export function createUserCommand(user: NewUser): Json {
  return {
    createUser: user.name,
    pwd: user.password,
    roles: roleArguments(user.roles, user.database),
    ...(user.customData === undefined ? {} : { customData: user.customData }),
  };
}

/** Feature: user.create — the dialog, then the plan of `createUser`. */
export function plan(context: Context, answers: Answers): Outcome {
  const copied = passwordToCopy(answers);
  if (copied !== undefined) {
    return run(copyPasswordPlan(copied));
  }
  const page = connectionPlace(context, answers);
  const readOnly = refusedReadOnly(page, 'user.create/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  const typedName = answerText(answers, 'name');
  if (typedName === undefined) {
    return userForm(page);
  }
  const name = typedName.trim();
  if (name === '') {
    return refuse('user.create/no-name', text.create.emptyName);
  }
  const password = passwordAnswer(answers) ?? '';
  if (password === '') {
    return refuse('user.create/no-password', text.password.empty);
  }
  const customData = customDataOf(answerText(answers, 'customData') ?? '', context.now);
  if ('problem' in customData) {
    return refuse('user.create/custom-data', customData.problem);
  }
  const database = answerText(answers, 'database')?.trim() || startingDatabase(page);
  const place: UserPlace = { ...page, database };
  const roles = rolesOf(answers['roles'], database);
  const user = userKey({ user: name, db: database });
  return run(
    writePlan(place, {
      title: text.create.plan(user),
      steps: [commandStep(place, createUserCommand({ name, password, roles, database, customData: customData.value }))],
      danger: { kind: 'none' },
      cannotUndo: text.create.undo,
      done: notifySuccess(
        roles.length === 0
          ? text.create.createdWithout(user)
          : text.create.createdWith(user, roles.map(roleKey).join(', ')),
        [copyPasswordAction('user.create', place, password)],
      ),
    }),
  );
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('user.create'), plan };
