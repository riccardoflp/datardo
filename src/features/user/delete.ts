/**
 * Feature: user.delete
 *
 * Deletes a user after a confirmation: one step, `db.getSiblingDB("shop").runCommand({ dropUser: "app" })`.
 * `user.signed-in` is read first, so that the confirmation says when the connection signs in as that user; deleting
 * it does not disconnect the connection, the server decides when the session ends. Started with `{ connection,
 * database, user }`: `app@shop` and `app@crm` are two users. Ported from Mongoster's `dropUser`.
 */
import { needRead, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { signedInOf } from './signed-in';
import { text } from './text';
import { isSignedInAs, requiredPlace, requiredText, userKey } from './types';
import { commandStep, notifySuccess, refusedReadOnly, writePlan } from './write/plan';

/** What the confirmation says under its question, with the warning when the connection signs in as the user. */
export function deleteDetail(own: boolean): string {
  return own ? `${text.deleteUser.own} ${text.deleteUser.detail}` : text.deleteUser.detail;
}

/** Feature: user.delete — `user.signed-in`, then the confirmed plan of `dropUser`. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = requiredPlace(context, answers);
  const readOnly = refusedReadOnly(place, 'user.delete/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  const name = requiredText(context, answers, 'user');
  if (!('signedIn' in answers)) {
    return needRead('signedIn', 'user.signed-in', { connection: place.connection });
  }
  const own = isSignedInAs(signedInOf(answers['signedIn']), { user: name, db: place.database });
  const user = userKey({ user: name, db: place.database });
  return run(
    writePlan(place, {
      title: text.deleteUser.plan(user),
      steps: [commandStep(place, { dropUser: name })],
      danger: {
        kind: 'confirm',
        text: `${text.deleteUser.question(user)}\n${deleteDetail(own)}`,
        button: text.deleteUser.button,
      },
      cannotUndo: text.deleteUser.undo,
      done: notifySuccess(text.deleteUser.deleted(user)),
    }),
  );
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('user.delete'), plan };
