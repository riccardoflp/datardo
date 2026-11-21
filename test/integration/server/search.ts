/**
 * A search of the largest keys as the window makes it (`src/ui/pages/server/server-largest.ts`): the calls `nextCall`
 * names, one after the other, each a Read the runner carries out, until the search ends.
 */
import {
  afterMeasure,
  afterScan,
  afterTypes,
  callArgs,
  nextCall,
  startSearch,
  type LargestKeysReply,
  type LargestKeysSearch,
} from '../../../src/features/server/largest-keys';
import type { ConnectionId } from '../../../src/shared/ids';
import { cacheId, resultOf, type LiveServer } from './live';

/** The search after one reply. */
function after(search: LargestKeysSearch, reply: LargestKeysReply): LargestKeysSearch {
  switch (reply.step) {
    case 'scan':
      return afterScan(search, reply.page, Date.now());
    case 'measure':
      return afterMeasure(search, reply.measured, Date.now());
    case 'type':
      return afterTypes(search, reply.types);
  }
}

/** Makes the calls of a search from `search` until it ends. */
export async function continueSearch(
  live: LiveServer,
  search: LargestKeysSearch,
  connection: ConnectionId = cacheId,
): Promise<LargestKeysSearch> {
  let now = search;
  for (let call = nextCall(now); call !== undefined; call = nextCall(now)) {
    const args = callArgs(call, connection, now.database);
    const reply = resultOf<LargestKeysReply>(
      await live.start('server.largest-keys', args, 'toolbar', { kind: 'connection', connection }),
    );
    now = after(now, reply);
  }
  return now;
}

/** A whole search of a database, from cursor 0. */
export function searchAll(
  live: LiveServer,
  database: number,
  connection: ConnectionId = cacheId,
): Promise<LargestKeysSearch> {
  return continueSearch(live, startSearch(database, undefined, Date.now()), connection);
}
