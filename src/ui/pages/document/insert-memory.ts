/**
 * What the window remembers of the insert dialog (`document.insert`): the text left in it when it was closed without
 * inserting, for each collection, until Datardo quits; the text of an insert sent, until it is known to have worked,
 * so that an insert that failed opens the dialog again with its text and the server's error; and the number of the
 * next new document's tab (`document.open`).
 */
import type { Json } from '../../../shared/engine-request';
import { connectionId } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import type { Notification } from '../../../shared/state/runner';
import { startFeature } from '../../shell/intent';

/** A collection, as the dialog's `about` names it. */
export interface DialogCollection {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
}

const left = new Map<string, string>();
let sent: { readonly where: DialogCollection; readonly text: string; readonly after: number } | undefined;
let newDocuments = 0;

function keyOf(where: DialogCollection): string {
  return JSON.stringify([where.connection, where.database, where.collection]);
}

/** The text left in the dialog of a collection. */
export function leftText(where: DialogCollection): string | undefined {
  return left.get(keyOf(where));
}

/** Remembers the text of a dialog closed without inserting; an empty text forgets it. */
export function leaveText(where: DialogCollection, text: string): void {
  if (text.trim() === '') {
    left.delete(keyOf(where));
  } else {
    left.set(keyOf(where), text);
  }
}

/** The dialog sent its text to be inserted, with the last notification there was then. */
export function textSent(where: DialogCollection, text: string, state: AppState): void {
  left.delete(keyOf(where));
  sent = { where, text, after: state.runner.notifications.at(-1)?.time ?? 0 };
}

/**
 * Follows the notifications of the insert sent: a success forgets its text; a failure opens the dialog again with the
 * text and the server's error, which the dialog shows in place of its hint.
 */
export function followInsert(notification: Notification | undefined): void {
  if (sent === undefined || notification?.feature !== 'document.insert' || notification.time < sent.after) {
    return;
  }
  const { where, text } = sent;
  sent = undefined;
  if (notification.level !== 'error') {
    return;
  }
  const args: Json = { ...where, text, failure: notification.details ?? notification.text };
  startFeature('document.insert', {
    place: 'dialog',
    target: { kind: 'collection', ...where, connection: connectionId(where.connection) },
    args,
  });
}

/** `n` of **New document n**: counted from 1 since Datardo started, after those of the tabs already open. */
export function nextNewDocument(state: AppState): number {
  const open = state.tabs.tabs.map((tab) => (tab.shows.kind === 'document' ? (tab.shows.newDocument ?? 0) : 0));
  newDocuments = Math.max(newDocuments, ...open) + 1;
  return newDocuments;
}
