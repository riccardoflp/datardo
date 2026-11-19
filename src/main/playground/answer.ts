/**
 * The answer of the main process to each call of a script (`playground.run`, step 3): the check of
 * `playground.writes` first, made here on every call so that no code of the script can go around it; then the call
 * refused, asked about (a drop), read from a cursor, carried out on a session, written and published, or sent.
 */
import type { Json } from '../../shared/engine-request';
import type { PlaygroundCall } from '../../features/playground/runtime/calls';
import { withReplicaSetHint } from '../../features/playground/sessions';
import { writeCheck } from '../../features/playground/writes';
import { cursorCall } from './cursors';
import { dropCall } from './drops';
import { publishedWrite } from './publish';
import { CallError, callError, send, sessionOf, type RunContext } from './run-context';
import { sessionCall } from './sessions';

async function answered(context: RunContext, call: PlaygroundCall): Promise<Json> {
  const check = writeCheck(call, context.connection);
  if (check.kind === 'refuse') {
    throw new CallError(check.message);
  }
  if (call.on === 'cursor') {
    return cursorCall(context, call);
  }
  if (call.on === 'session' || (call.on === 'mongo' && call.method === 'startSession')) {
    return sessionCall(context, call);
  }
  const request = { ...check.request, ...sessionOf(context, call.session) };
  if (check.kind === 'ask') {
    return dropCall(context, check.drop, request, call.scriptDatabase);
  }
  if (check.publish !== undefined) {
    return publishedWrite(context, request, check.publish);
  }
  return send(context, request);
}

/**
 * Answers one call of the script: its reply as canonical Extended JSON, or a {@link CallError} that the script gets
 * as its error, the sentence about replica sets added to the server's refusal of a transaction.
 */
export async function answerCall(context: RunContext, call: PlaygroundCall): Promise<Json> {
  try {
    return await answered(context, call);
  } catch (error: unknown) {
    const failed = callError(error);
    throw new CallError(withReplicaSetHint(failed.message), failed.labels);
  }
}
