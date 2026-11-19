/**
 * Feature: user.delete-role
 *
 * Deletes a custom role after a confirmation: one step, `db.getSiblingDB("shop").runCommand({ dropRole: "reader" })`.
 * The users and roles that had it lose its privileges, and the server forgets who had it. A built-in role is refused
 * before anything is asked. Started with `{ connection, database, role, builtIn }`. Ported from Mongoster's
 * `dropRole`.
 */
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { isBuiltInRole } from './role-reference';
import { text } from './text';
import { requiredPlace, requiredText, roleKey, startArgs } from './types';
import { commandStep, notifySuccess, refusedReadOnly, writePlan } from './write/plan';

/** Feature: user.delete-role — the confirmed plan of `dropRole`. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = requiredPlace(context, answers);
  const readOnly = refusedReadOnly(place, 'user.delete-role/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  const name = requiredText(context, answers, 'role');
  if (startArgs(answers)['builtIn'] === true || isBuiltInRole({ role: name, db: place.database })) {
    return refuse('user.delete-role/built-in', text.editRole.builtIn);
  }
  const role = roleKey({ role: name, db: place.database });
  return run(
    writePlan(place, {
      title: text.deleteRole.plan(role),
      steps: [commandStep(place, { dropRole: name })],
      danger: {
        kind: 'confirm',
        text: `${text.deleteRole.question(role)}\n${text.deleteRole.detail}`,
        button: text.deleteRole.button,
      },
      cannotUndo: text.deleteRole.undo,
      done: notifySuccess(text.deleteRole.deleted(role)),
    }),
  );
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('user.delete-role'), plan };
