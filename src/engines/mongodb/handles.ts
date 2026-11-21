/**
 * What a MongoDB client keeps between requests, each by an identifier the engine gives: the cursors a playground reads
 * a batch at a time, the change streams of Watch changes, and the sessions of a playground (`playground.sessions`).
 * The main process closes what it opened; whatever is left is closed with the client.
 */
import type {
  AbstractCursor,
  AggregationCursor,
  ChangeStream,
  ClientSession,
  FindCursor,
  GridFSBucketReadStream,
} from 'mongodb';
import { EngineError } from '../engine';

/** How many cursors, change streams and sessions one client keeps open at most (R9.2). */
export const mostKept = 100;

/** Something kept: a cursor of `find` or `aggregate`, a change stream, or a session. */
export type Kept =
  | { readonly kind: 'cursor'; readonly cursor: FindCursor | AggregationCursor }
  | { readonly kind: 'change-stream'; readonly stream: ChangeStream }
  | { readonly kind: 'session'; readonly session: ClientSession }
  | {
      readonly kind: 'download';
      readonly stream: GridFSBucketReadStream;
      /** The chunks of the stream, read one at a time. */
      readonly chunks: AsyncIterator<Uint8Array>;
    };

/** The things one client keeps, by identifier. */
export interface Handles {
  /** Keeps something and gives its identifier: `cursor-1`, `change-stream-2`, `session-3`. */
  readonly keep: (kept: Kept) => string;
  /** The cursor kept as `id`; an error when there is none. */
  readonly cursor: (id: unknown) => FindCursor | AggregationCursor;
  /** The change stream kept as `id`; an error when there is none. */
  readonly changeStream: (id: unknown) => ChangeStream;
  /** The session kept as `id`; an error when there is none. */
  readonly session: (id: unknown) => ClientSession;
  /** The download of a GridFS file kept as `id`; an error when there is none. */
  readonly download: (id: unknown) => Extract<Kept, { kind: 'download' }>;
  /** Forgets what is kept as `id`, and gives it back so that it can be closed; `undefined` when nothing was. */
  readonly release: (id: unknown) => Kept | undefined;
  /** Closes everything kept: when the client closes. */
  readonly closeAll: () => Promise<void>;
}

const kindWords: Readonly<Record<Kept['kind'], string>> = {
  cursor: 'cursor',
  'change-stream': 'change stream',
  session: 'session',
  download: 'download',
};

/** Closes one thing kept: a cursor or a change stream is closed on the server, a session ended. */
export async function closeKept(kept: Kept): Promise<void> {
  switch (kept.kind) {
    case 'cursor':
      await (kept.cursor as AbstractCursor).close();
      return;
    case 'change-stream':
      await kept.stream.close();
      return;
    case 'session':
      await kept.session.endSession();
      return;
    case 'download':
      await kept.stream.abort();
      return;
  }
}

/** The things a new client keeps: none yet. */
export function createHandles(): Handles {
  const kept = new Map<string, Kept>();
  let last = 0;
  const found = <K extends Kept['kind']>(id: unknown, kind: K): Extract<Kept, { kind: K }> => {
    const each = typeof id === 'string' ? kept.get(id) : undefined;
    if (each?.kind !== kind) {
      throw new EngineError(`No ${kindWords[kind]} ${String(id)} is open: it was closed, or never opened.`);
    }
    return each as Extract<Kept, { kind: K }>;
  };
  return {
    keep: (each) => {
      if (kept.size >= mostKept) {
        throw new EngineError(
          `Datardo keeps at most ${String(mostKept)} cursors, change streams and sessions open on one connection.`,
        );
      }
      last += 1;
      const id = `${each.kind}-${String(last)}`;
      kept.set(id, each);
      return id;
    },
    cursor: (id) => found(id, 'cursor').cursor,
    changeStream: (id) => found(id, 'change-stream').stream,
    session: (id) => found(id, 'session').session,
    download: (id) => found(id, 'download'),
    release: (id) => {
      const each = typeof id === 'string' ? kept.get(id) : undefined;
      if (typeof id === 'string') {
        kept.delete(id);
      }
      return each;
    },
    closeAll: async () => {
      const all = [...kept.values()];
      kept.clear();
      // The client closes right after: a cursor or a session that fails to close here ends with its connection.
      await Promise.allSettled(all.map(closeKept));
    },
  };
}
