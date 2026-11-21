/**
 * What the controls of the Users and roles page and of its inspector do: a control that starts a feature starts it
 * from its place with what its View gave, and one that copies puts its text on the clipboard.
 *
 * **Create user** is followed: when the server refuses the user (a name already taken), the dialog opens again with
 * its answers as they were and the server's error (`user.create`). Its password stays in the window for that only:
 * the dialog sent it once, and the window gives it back to the dialog it opens again, without sending it through the
 * main process a second time; it is forgotten as soon as the outcome is known or that dialog closes (T21, D41).
 */
import { isRecord, type UserControl } from '../../../features/user/types';
import type { Json } from '../../../shared/engine-request';
import type { Answers } from '../../../shared/feature';
import { featureId, type Place } from '../../../shared/ids';
import type { Target } from '../../../shared/target';

/** Whether a **Create user** started here waits for its outcome. */
let pending = false;
/** The answers of the **Create user** that waits, until its outcome is known. */
let sent: Answers | undefined;
/** The password of a dialog opened again after a refusal, until that dialog is answered or closed. */
let given: string | undefined;

/** The dialog of `user.create` answered: its answers are kept until the outcome is known, when it is followed. */
export function createAnswered(answers: Answers): void {
  given = undefined;
  sent = pending ? answers : undefined;
}

/** The password of the dialog opened again, which it starts with; empty for any other dialog. */
export function givenPassword(): string {
  return given ?? '';
}

/** Forgets every password kept here: the dialog was closed. */
export function forgetPasswords(): void {
  sent = undefined;
  given = undefined;
}

/** Whether the window keeps a password now, for the test of T21. */
export function keepsPassword(): boolean {
  return sent !== undefined || given !== undefined;
}

/** The answers kept while the dialog was open, taken once the outcome is known. */
function takeSent(): Answers | undefined {
  const answers = sent;
  sent = undefined;
  return answers;
}

function textOf(answers: Answers, key: string): string {
  const value = answers[key];
  return typeof value === 'string' ? value : '';
}

/** Starts `user.create`, and opens its dialog again with what was typed when the server refused the user. */
export async function createUser(target: Target, args: Json, place?: Place): Promise<void> {
  sent = undefined;
  pending = true;
  const result = await window.datardo
    .start({ feature: featureId('user.create'), target, ...(place === undefined ? {} : { place }), args })
    .finally(() => {
      pending = false;
    });
  const answers = takeSent();
  given = undefined;
  if (result.kind !== 'failed' || answers === undefined) {
    return;
  }
  given = textOf(answers, 'password');
  const retry: Json = {
    name: textOf(answers, 'name'),
    database: textOf(answers, 'database'),
    roles: (answers['roles'] ?? []) as Json,
    customData: textOf(answers, 'customData'),
  };
  const fields = isRecord(args) ? args : {};
  await createUser(target, { ...fields, retry, failure: result.message }, place);
}

/** Carries out a control of the page or of the inspector, from its place. */
export function act(control: UserControl, place: Place): void {
  if (control.kind === 'copy') {
    void navigator.clipboard.writeText(control.text);
    return;
  }
  if (control.feature === 'user.create') {
    void createUser(control.target, control.args, place);
    return;
  }
  void window.datardo.start({
    feature: featureId(control.feature),
    target: control.target,
    place,
    args: control.args,
  });
}
