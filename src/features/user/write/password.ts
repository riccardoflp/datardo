/**
 * The password of a user being created or changed (T21, D41). It is typed or generated in the dialog, sent once in the
 * step, and written `***` in the step's text, the confirmation and the Log (`runner.step-text` masks `pwd` of
 * `createUser` and `updateUser`). After the write, the notification's **Copy password** holds it until the
 * notification closes: the button starts the same feature with `args.copyPassword`, whose plan copies it and sends
 * nothing. No notification text and no refusal repeats it.
 */
import type { Json } from '../../../shared/engine-request';
import type { Answers, NotificationAction, Plan, Step } from '../../../shared/feature';
import { featureId } from '../../../shared/ids';
import type { TextField } from '../../../shared/question';
import type { Target } from '../../../shared/target';
import { text } from '../text';
import { startArgs, textOf, type UserPlace } from '../types';

/** The field **Password**, hidden as it is typed; the dialog adds **Generate**, **Show** or **Hide**, and **Copy**. */
export const passwordQuestionField: TextField = {
  kind: 'text',
  key: 'password',
  label: text.password.label,
  placeholder: text.password.placeholder,
  secret: true,
  rules: [{ kind: 'not-empty', message: text.password.empty }],
};

/** The password typed or generated: as it is, spaces included; `undefined` before the dialog was answered. */
export function passwordAnswer(answers: Answers): string | undefined {
  const value = answers['password'];
  return typeof value === 'string' ? value : undefined;
}

/** The target of a button of the notification: the database of the user. */
export function placeTarget(place: UserPlace): Target {
  return { kind: 'database', connection: place.connection, database: place.database };
}

/** **Copy password**, which starts `feature` again to copy the password it holds. */
export function copyPasswordAction(feature: string, place: UserPlace, password: string): NotificationAction {
  const args: Json = { connection: place.connection, database: place.database, copyPassword: password };
  return { label: text.password.copyPassword, feature: featureId(feature), target: placeTarget(place), args };
}

/** The password **Copy password** holds, when the feature was started by it. */
export function passwordToCopy(answers: Answers): string | undefined {
  return textOf(startArgs(answers), 'copyPassword');
}

/** The plan of **Copy password**: nothing is sent; the password goes to the clipboard. */
export function copyPasswordPlan(password: string): Plan {
  const steps: readonly Step[] = [];
  return {
    title: text.password.copyPlan,
    steps,
    danger: { kind: 'none' },
    undo: { cannot: text.password.copyPasswordTooltip },
    publishes: false,
    after: [{ kind: 'copy', text: password }],
  };
}
