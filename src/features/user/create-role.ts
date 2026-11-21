/**
 * Feature: user.create-role
 *
 * Creates a custom role from the dialog **New role**: one step, `db.getSiblingDB("shop").runCommand({ createRole:
 * "reader", privileges: [{ resource: { db: "shop", collection: "orders" }, actions: ["find"] }], roles: ["read"] })`.
 * Empty **Privileges** are sent as `privileges: []`, no inherited roles as `roles: []`. Started with `{ connection,
 * database }`, the database chosen in the page (`null` with **All databases**). Ported from Mongoster's `saveRole` and
 * `openRoleForm`.
 */
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
import { answerText, connectionPlace, roleKey, rolesOf, type UserPlace } from './types';
import { commandStep, notifySuccess, refusedReadOnly, writePlan } from './write/plan';
import { privilegesOf, roleQuestion } from './write/role-form';

/** Feature: user.create-role — the dialog, then the plan of `createRole`. */
export function plan(context: Context, answers: Answers): Outcome {
  const page = connectionPlace(context, answers);
  const readOnly = refusedReadOnly(page, 'user.create-role/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  const startingDatabase = page.database === '' ? 'admin' : page.database;
  const typedName = answerText(answers, 'name');
  if (typedName === undefined) {
    return ask(
      roleQuestion({
        connection: page.connection,
        title: text.createRole.title,
        button: text.createRole.button,
        name: '',
        database: startingDatabase,
        privileges: '',
        inherits: '',
      }),
    );
  }
  const name = typedName.trim();
  if (name === '') {
    return refuse('user.create-role/no-name', text.createRole.emptyName);
  }
  const typed = privilegesOf(answerText(answers, 'privileges') ?? '', context.now);
  if (typed.kind === 'problem') {
    return typed.reason === 'privileges'
      ? refuse('user.create-role/privileges', typed.message)
      : refuse('user.create-role/not-a-list', typed.message);
  }
  const database = answerText(answers, 'database')?.trim() || startingDatabase;
  const place: UserPlace = { ...page, database };
  const roles = rolesOf(answers['inherits'], database);
  const role = roleKey({ role: name, db: database });
  return run(
    writePlan(place, {
      title: text.createRole.plan(role),
      steps: [
        commandStep(place, {
          createRole: name,
          privileges: typed.privileges,
          roles: roleArguments(roles, database),
        }),
      ],
      danger: { kind: 'none' },
      cannotUndo: text.createRole.undo,
      done: notifySuccess(text.createRole.created(role)),
    }),
  );
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('user.create-role'), plan };
