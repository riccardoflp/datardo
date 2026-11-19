/**
 * Feature: connection.copy-string — puts the saved connection string on the clipboard, password included. The main
 * process reads it in the secret storage and writes the clipboard: the text never reaches the window.
 */
import type { Json } from '../../shared/engine-request';
import type { After, Context, Outcome, ReadRequest } from '../../shared/feature';
import { organizeText } from './text';
import { jsonFields, nothingToDo, targetConnection } from './types';

/** What the main process answers: whether something was copied, and the name of the connection. */
export interface CopyResult {
  readonly copied: boolean;
  readonly name: string;
}

/** Feature: connection.copy-string — asks the main process to copy the connection string of the connection. */
export function request(context: Context, _args: Json): ReadRequest | Outcome {
  const connection = targetConnection(context);
  if (connection === undefined) {
    return nothingToDo('Copy connection string', 'Nothing to undo.');
  }
  return { kind: 'app', action: 'connection.copy-string', args: { connection: connection.id, name: connection.name } };
}

/** Feature: connection.copy-string — what was copied, from the reply of the main process. */
export function parse(replies: readonly unknown[], args: Json): CopyResult {
  const reply = jsonFields((replies[0] ?? null) as Json);
  const name = jsonFields(args)['name'];
  return {
    copied: reply['copied'] === true,
    name: typeof reply['name'] === 'string' ? reply['name'] : typeof name === 'string' ? name : '',
  };
}

/** Feature: connection.copy-string — the notification, and the Log line with the name, never the text. */
export function after(result: unknown, _context: Context): readonly After[] {
  const copied = result as CopyResult;
  if (!copied.copied) {
    return [];
  }
  return [
    { kind: 'notify', level: 'success', text: organizeText.copied },
    { kind: 'log', text: organizeText.copiedLog(copied.name) },
  ];
}
