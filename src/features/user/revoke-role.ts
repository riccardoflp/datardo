/**
 * Feature: user.revoke-role
 *
 * Revokes a role from a user, from `✕` on its chip in the inspector, after a confirmation: one step,
 * `db.getSiblingDB("shop").runCommand({ revokeRolesFromUser: "app", roles: [{ role: "read", db: "reporting" }] })`.
 * `user.signed-in` is read first, so that the confirmation warns when the connection signs in as that user. Started
 * with `{ connection, database, user, role }`, the role as `{ role, db }` or written whole. Ported from Mongoster's
 * `revokeRole`.
 */
import { needRead, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { roleArgument } from './role-reference';
import { signedInOf } from './signed-in';
import { text } from './text';
import { isSignedInAs, requiredPlace, requiredText, roleKey, roleOf, startArgs, userKey } from './types';
import { commandStep, notifySuccess, refusedReadOnly, writePlan } from './write/plan';

/** Feature: user.revoke-role — `user.signed-in`, then the confirmed plan of `revokeRolesFromUser`. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = requiredPlace(context, answers);
  const readOnly = refusedReadOnly(place, 'user.revoke-role/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  const name = requiredText(context, answers, 'user');
  const role = roleOf(startArgs(answers)['role'], place.database);
  if (role === undefined) {
    throw new Error('user.revoke-role is started with the role of a chip.');
  }
  if (!('signedIn' in answers)) {
    return needRead('signedIn', 'user.signed-in', { connection: place.connection });
  }
  const own = isSignedInAs(signedInOf(answers['signedIn']), { user: name, db: place.database });
  const user = userKey({ user: name, db: place.database });
  const whole = roleKey(role);
  return run(
    writePlan(place, {
      title: text.revoke.plan(whole, user),
      steps: [commandStep(place, { revokeRolesFromUser: name, roles: [roleArgument(role, place.database)] })],
      danger: {
        kind: 'confirm',
        text: `${text.revoke.question(whole, user)}\n${own ? text.revoke.ownLoses : text.revoke.loses}`,
        button: text.revoke.button,
      },
      cannotUndo: text.revoke.undo,
      done: notifySuccess(text.revoke.revoked(whole, user)),
    }),
  );
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('user.revoke-role'), plan };
