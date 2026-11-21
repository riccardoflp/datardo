/**
 * Feature: user.edit-role
 *
 * Replaces the privileges and the inherited roles of a custom role from the dialog **Edit reader@shop**: one step,
 * `db.getSiblingDB("shop").runCommand({ updateRole: "reader", privileges: […], roles: [] })`. Both lists are always
 * sent and each replaces the role's. The role is read first (`user.list-roles` of its database), so that the dialog
 * starts with its own privileges as the server reports them, one per line, and the roles it inherits; its name and
 * database cannot be changed. A built-in role is refused before anything is sent. Started with `{ connection,
 * database, role, builtIn }`. Ported from Mongoster's `saveRole` and `openRoleForm`.
 */
import {
  ask,
  needRead,
  refuse,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { RolesRead } from './list-roles';
import { isBuiltInRole, roleArguments } from './role-reference';
import { text } from './text';
import {
  answerText,
  isRecord,
  requiredPlace,
  requiredText,
  roleKey,
  rolesOf,
  rolesText,
  startArgs,
  type Role,
  type UserPlace,
} from './types';
import { commandStep, notifySuccess, refusedReadOnly, writePlan } from './write/plan';
import { privilegesOf, privilegesText, roleQuestion } from './write/role-form';

/** The role named, among the roles read; `undefined` when it is not there. */
export function roleRead(read: unknown, name: string, database: string): Role | undefined {
  if (!isRecord(read) || read['kind'] !== 'roles') {
    return undefined;
  }
  return (read as unknown as Extract<RolesRead, { kind: 'roles' }>).roles.find(
    (role) => role.role === name && role.db === database,
  );
}

/** Feature: user.edit-role — the role read, the dialog with what it has, then the plan of `updateRole`. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = requiredPlace(context, answers);
  const readOnly = refusedReadOnly(place, 'user.edit-role/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  const name = requiredText(context, answers, 'role');
  const whole = roleKey({ role: name, db: place.database });
  if (startArgs(answers)['builtIn'] === true || isBuiltInRole({ role: name, db: place.database })) {
    return refuse('user.edit-role/built-in', text.editRole.builtIn);
  }
  if (!('roles' in answers)) {
    return needRead('roles', 'user.list-roles', {
      connection: place.connection,
      database: place.database,
      builtIn: false,
      known: [],
    });
  }
  const role = roleRead(answers['roles'], name, place.database);
  if (role === undefined) {
    return refuse('user.edit-role/gone', text.editRole.gone(whole));
  }
  if (role.isBuiltin) {
    return refuse('user.edit-role/built-in', text.editRole.builtIn);
  }
  if (answerText(answers, 'privileges') === undefined) {
    return ask(
      roleQuestion({
        connection: place.connection,
        title: text.editRole.title(whole),
        button: text.editRole.button,
        name,
        database: place.database,
        privileges: privilegesText(role.privileges),
        inherits: rolesText(role.roles),
      }),
    );
  }
  return updatePlan(context, answers, place, name);
}

/** The plan of `updateRole` from what the dialog answered. */
function updatePlan(context: Context, answers: Answers, place: UserPlace, name: string): Outcome {
  const whole = roleKey({ role: name, db: place.database });
  const typed = privilegesOf(answerText(answers, 'privileges') ?? '', context.now);
  if (typed.kind === 'problem') {
    return typed.reason === 'privileges'
      ? refuse('user.edit-role/privileges', typed.message)
      : refuse('user.edit-role/not-a-list', typed.message);
  }
  const roles = rolesOf(answers['inherits'], place.database);
  return run(
    writePlan(place, {
      title: text.editRole.plan(whole),
      steps: [
        commandStep(place, {
          updateRole: name,
          privileges: typed.privileges,
          roles: roleArguments(roles, place.database),
        }),
      ],
      danger: { kind: 'none' },
      cannotUndo: text.editRole.undo,
      done: notifySuccess(text.editRole.updated(whole)),
    }),
  );
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('user.edit-role'), plan };
