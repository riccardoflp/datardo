/**
 * Feature: connection.secrets — where the connection string and the passwords of a connection are kept, when they are
 * deleted, and where they can and cannot go. Its steps are those of the other cards of the area that save, read or
 * remove a connection; started alone it saves or deletes the secrets of one connection.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { AppStep, Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { planText } from './text';
import { appStep, argumentsOf, nothingToDo, targetConnection } from './types';

/** The keys of the secrets of a connection in the secret storage (data.md, security.md "Secrets"). */
export function secretKeys(connection: string): { readonly string: string; readonly options: string } {
  return { string: `connection/${connection}/string`, options: `connection/${connection}/options` };
}

/** The key of the access token of the MCP server, kept in the same storage (`mcp.server`). */
export const mcpTokenKey = 'mcp/token';

/** The step `save the secrets of <name>`: the secrets the form says, the empty fields keeping the saved ones. */
export function saveSecretsStep(connection: ConnectionView, form: Json): AppStep {
  return appStep('secrets.write', { connection: connection.id, form }, planText.saveSecrets(connection.name));
}

/** The step `delete the secrets of <name>`: every value of the connection in the secret storage. */
export function deleteSecretsStep(connection: ConnectionView): AppStep {
  return appStep('secrets.delete', { connection: connection.id }, planText.deleteSecrets(connection.name));
}

/**
 * Feature: connection.secrets — `args` is `{ delete: true }` to delete the secrets of the connection, or `{ form }` to
 * save those the form says. Nothing is written in clear text: the main process encrypts each value, or keeps it in
 * memory when the system has no keychain.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const connection = targetConnection(context);
  if (connection === undefined) {
    return nothingToDo('Secrets', planText.cannotUndoSecrets);
  }
  const args = argumentsOf(answers);
  const step =
    args['delete'] === true
      ? deleteSecretsStep(connection)
      : saveSecretsStep(connection, (args['form'] ?? null) as Json);
  return run({
    title: step.text,
    steps: [step],
    danger: noDanger,
    undo: { cannot: planText.cannotUndoSecrets },
    publishes: false,
    after: [],
  });
}
