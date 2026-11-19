/**
 * The part of the app's state about publishing for redis-oplog (oplog.md): for each MongoDB connection, the last error
 * publishing its writes (which the tool `redis_oplog_status` reports) and when the warning of `oplog.publish-error`
 * was last shown.
 */
import type { ConnectionId } from '../ids';

/** The last error publishing the writes of a connection. */
export interface PublishFailure {
  readonly time: number;
  readonly message: string;
}

/** The part of the app's state about publishing: by MongoDB connection, its last error and its last warning. */
export interface OplogState {
  readonly lastErrors: Readonly<Record<string, PublishFailure>>;
  /** When the warning of `oplog.publish-error` was last shown. */
  readonly warnedAt: Readonly<Record<string, number>>;
}

/** Nothing failed yet. */
export const initialOplogState: OplogState = { lastErrors: {}, warnedAt: {} };

/** The events of this part of the state. */
export type OplogStateEvent =
  | {
      readonly slice: 'oplog';
      readonly type: 'failed';
      readonly connection: ConnectionId;
      readonly failure: PublishFailure;
      /** Whether the warning was shown for this failure. */
      readonly warned: boolean;
    }
  | { readonly slice: 'oplog'; readonly type: 'forgotten'; readonly connection: ConnectionId };

function without<T>(record: Readonly<Record<string, T>>, key: string): Readonly<Record<string, T>> {
  return Object.fromEntries(Object.entries(record).filter(([each]) => each !== key));
}

/** Changes this part of the state. */
export function reduceOplog(state: OplogState, event: OplogStateEvent): OplogState {
  switch (event.type) {
    case 'failed':
      return {
        lastErrors: { ...state.lastErrors, [event.connection]: event.failure },
        warnedAt: event.warned ? { ...state.warnedAt, [event.connection]: event.failure.time } : state.warnedAt,
      };
    case 'forgotten':
      return {
        lastErrors: without(state.lastErrors, event.connection),
        warnedAt: without(state.warnedAt, event.connection),
      };
  }
}
