/**
 * Feature: oplog.publish-error — tells the user that a write was saved but couldn't be published, without repeating
 * it at every write. The warning is drawn by `runner.notify`; the errors in between are kept as the connection's last
 * error, which the tool `redis_oplog_status` reports.
 */
import type { ConnectionId } from '../../shared/ids';
import { oplogText } from './text';
import type { OplogState, OplogStateEvent } from './types';

/** The warning is shown at most once every 30 seconds for each MongoDB connection. */
export const warnEveryMs = 30_000;

/** What the warning is decided from: the part of the state, the connection, its name, the error, and the time. */
export interface PublishErrorState {
  readonly oplog: OplogState;
  readonly connection: ConnectionId;
  /** The MongoDB connection's name. */
  readonly name: string;
  readonly error: string;
  /** What must never show in the warning: the linked connection's connection string and its password. */
  readonly secrets: readonly string[];
  readonly now: number;
}

/** What follows the failure: the event that keeps it, and the warning when it is time to show one. */
export interface PublishErrorView {
  readonly event: OplogStateEvent;
  readonly warning?: { readonly level: 'warning'; readonly text: string };
}

/** The error without the secrets it may hold: a connection string's credentials, and each secret given, as `***`. */
export function withoutSecrets(error: string, secrets: readonly string[]): string {
  const credentials = error.replace(/(rediss?:\/\/)[^@\s/]*@/giu, '$1');
  return secrets
    .filter((secret) => secret !== '')
    .reduce((text, secret) => text.split(secret).join('***'), credentials);
}

/** Whether the warning is shown now: never shown for the connection, or last shown 30 seconds ago or more. */
export function isTimeToWarn(oplog: OplogState, connection: ConnectionId, now: number): boolean {
  const last = oplog.warnedAt[connection];
  return last === undefined || now - last >= warnEveryMs;
}

/** Feature: oplog.publish-error. */
export function view(state: PublishErrorState): PublishErrorView {
  const message = withoutSecrets(state.error, state.secrets);
  const warned = isTimeToWarn(state.oplog, state.connection, state.now);
  return {
    event: {
      slice: 'oplog',
      type: 'failed',
      connection: state.connection,
      failure: { time: state.now, message },
      warned,
    },
    ...(warned ? { warning: { level: 'warning', text: oplogText.warning(state.name, message) } } : {}),
  };
}
