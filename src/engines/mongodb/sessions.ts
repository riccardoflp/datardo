/**
 * Sessions and transactions a client keeps for a playground (`playground.sessions`):
 *
 * - `startSession` `[options]` (mongosh's options: `causalConsistency`, `readConcern`, `writeConcern`,
 *   `readPreference`, `defaultTransactionOptions`) replies `{ session, id }`: the identifier that requests name in
 *   their `session` to run in it, and the server's session id (`lsid`).
 * - `startTransaction` `[session, options]`, `commitTransaction` `[session]`, `abortTransaction` `[session]` and
 *   `endSession` `[session]` reply `{ ok: 1 }`; `endSession` aborts a transaction still open and forgets the session.
 * - `sessionInfo` `[session]` replies `{ id, inTransaction, hasEnded, clusterTime, operationTime }`.
 *
 * A failed operation of a transaction carries the server's error labels (`TransientTransactionError`,
 * `UnknownTransactionCommitResult`), which say whether `withTransaction` tries again.
 */
import type { ClientSession, Document } from 'mongodb';
import type { Call } from './call';
import { sessionOptions, transactionOptions } from './mongosh-forms';

const ok = { ok: 1 };

function information(session: ClientSession): Document {
  return {
    id: session.id ?? null,
    inTransaction: session.inTransaction(),
    hasEnded: session.hasEnded,
    clusterTime: session.clusterTime ?? null,
    operationTime: session.operationTime ?? null,
  };
}

function started(call: Call): Document {
  const session = call.client.startSession(sessionOptions(call.args[0]));
  return { session: call.handles.keep({ kind: 'session', session }), id: session.id ?? null };
}

async function ended(call: Call): Promise<Document> {
  const session = call.handles.session(call.args[0]);
  call.handles.release(call.args[0]);
  await session.endSession();
  return ok;
}

/** Carries out a method of sessions; `undefined` when the method is not one of them. */
export function sessionMethod(call: Call): Promise<unknown> | undefined {
  const [first, second] = call.args;
  switch (call.request.method) {
    case 'startSession':
      return Promise.resolve(started(call));
    case 'startTransaction':
      call.handles.session(first).startTransaction(transactionOptions(second));
      return Promise.resolve(ok);
    case 'commitTransaction':
      return call.handles
        .session(first)
        .commitTransaction()
        .then(() => ok);
    case 'abortTransaction':
      return call.handles
        .session(first)
        .abortTransaction()
        .then(() => ok);
    case 'endSession':
      return ended(call);
    case 'sessionInfo':
      return Promise.resolve(information(call.handles.session(first)));
    default:
      return undefined;
  }
}
