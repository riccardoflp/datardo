/**
 * Feature: user.grant-role
 *
 * Grants a role to a user from the inspector's **Grant**: one step, `db.getSiblingDB("shop").runCommand({
 * grantRolesToUser: "app", roles: ["read"] })`, or `roles: [{ role: "read", db: "reporting" }]` for a role of another
 * database (`user.role-reference`). Started with `{ connection, database, user, role, roleDatabase }`: the role is the
 * text of the inspector's field (or `{ role, db }`), and `roleDatabase` the database beside it, the user's when absent.
 * Ported from Mongoster's `grantRoles`.
 */
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { roleArgument } from './role-reference';
import { text } from './text';
import { requiredPlace, requiredText, roleKey, roleOf, startArgs, textOf, userKey } from './types';
import { commandStep, notifySuccess, refusedReadOnly, writePlan } from './write/plan';

/** Feature: user.grant-role — the plan of `grantRolesToUser`; an empty field sends nothing. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = requiredPlace(context, answers);
  const readOnly = refusedReadOnly(place, 'user.grant-role/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  const name = requiredText(context, answers, 'user');
  const args = startArgs(answers);
  const role = roleOf(args['role'], textOf(args, 'roleDatabase')?.trim() || place.database);
  if (role === undefined) {
    return refuse('user.grant-role/no-role', text.grant.noRole);
  }
  const user = userKey({ user: name, db: place.database });
  return run(
    writePlan(place, {
      title: text.grant.plan(roleKey(role), user),
      steps: [commandStep(place, { grantRolesToUser: name, roles: [roleArgument(role, place.database)] })],
      danger: { kind: 'none' },
      cannotUndo: text.grant.undo,
      done: notifySuccess(text.grant.granted(roleKey(role), user)),
    }),
  );
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('user.grant-role'), plan };
