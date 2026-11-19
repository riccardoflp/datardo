/**
 * Feature: user.change-password
 *
 * Sets a new password for a user: one step, `db.getSiblingDB("shop").runCommand({ updateUser: "app", pwd: "***" })`,
 * sent with the password and written with `***` (T21, D41). Nothing else of the user is in the command, so its roles
 * and custom data stay. Started with `{ connection, database, user }`.
 *
 * `user.signed-in` is read first: for the user the connection signs in as, the dialog has a note and the notification
 * offers **Save in the connection** (D49), which starts this feature again with `args.saveInConnection`: one app step
 * that keeps the new password in the connection's secrets (`connection.secrets`), and nothing sent to the server.
 * Ported from Mongoster's `setPassword` and `openUserForm`.
 */
import type { Json } from '../../shared/engine-request';
import {
  ask,
  needRead,
  refuse,
  run,
  type Answers,
  type Context,
  type NotificationAction,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appPlan, appStep } from '../nav/types';
import { signedInOf } from './signed-in';
import { text } from './text';
import { isSignedInAs, requiredPlace, requiredText, startArgs, textOf, userKey, type UserPlace } from './types';
import {
  copyPasswordAction,
  copyPasswordPlan,
  passwordAnswer,
  passwordQuestionField,
  passwordToCopy,
  placeTarget,
} from './write/password';
import { commandStep, notifySuccess, refusedReadOnly, writePlan } from './write/plan';

/** The action of the main process that keeps a new password in a connection's secrets (D49). */
export const savePasswordAction = 'connection.save-password';

/** **Save in the connection**, which starts this feature again to keep the password in the connection. */
function saveAction(place: UserPlace, user: string, password: string): NotificationAction {
  const args: Json = { connection: place.connection, database: place.database, user, saveInConnection: password };
  return {
    label: text.changePassword.saveInConnection,
    feature: featureId('user.change-password'),
    target: placeTarget(place),
    args,
  };
}

/** The plan of **Save in the connection**: one app step, written without the password. */
function savePlan(place: UserPlace, password: string): Outcome {
  const step = appStep(text.changePassword.saveStep(place.connectionName), savePasswordAction, {
    connection: place.connection,
    password,
  });
  return run(
    appPlan(
      text.changePassword.savePlan(place.connectionName),
      [step],
      [notifySuccess(text.changePassword.saved(place.connectionName))],
    ),
  );
}

function passwordForm(user: string, own: boolean): Outcome {
  return ask({
    title: text.changePassword.title(user),
    ...(own ? { text: text.changePassword.ownNote } : {}),
    button: text.changePassword.button,
    fields: [passwordQuestionField],
  });
}

/** Feature: user.change-password — `user.signed-in`, the dialog, then the plan of `updateUser`. */
export function plan(context: Context, answers: Answers): Outcome {
  const copied = passwordToCopy(answers);
  if (copied !== undefined) {
    return run(copyPasswordPlan(copied));
  }
  const place = requiredPlace(context, answers);
  const name = requiredText(context, answers, 'user');
  const saved = textOf(startArgs(answers), 'saveInConnection');
  if (saved !== undefined) {
    return savePlan(place, saved);
  }
  const readOnly = refusedReadOnly(place, 'user.change-password/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  if (!('signedIn' in answers)) {
    return needRead('signedIn', 'user.signed-in', { connection: place.connection });
  }
  const own = isSignedInAs(signedInOf(answers['signedIn']), { user: name, db: place.database });
  const user = userKey({ user: name, db: place.database });
  const password = passwordAnswer(answers);
  if (password === undefined) {
    return passwordForm(user, own);
  }
  if (password === '') {
    return refuse('user.change-password/no-password', text.password.empty);
  }
  const actions = [
    copyPasswordAction('user.change-password', place, password),
    ...(own ? [saveAction(place, name, password)] : []),
  ];
  return run(
    writePlan(place, {
      title: text.changePassword.plan(user),
      steps: [commandStep(place, { updateUser: name, pwd: password })],
      danger: { kind: 'none' },
      cannotUndo: text.changePassword.undo,
      done: notifySuccess(own ? text.changePassword.changedOwn(user) : text.changePassword.changed(user), actions),
    }),
  );
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('user.change-password'), plan };
