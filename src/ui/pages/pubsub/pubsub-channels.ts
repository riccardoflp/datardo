/**
 * The reads of the list **Active channels** (`pubsub.channels`), started through the bridge on the connection's
 * ordinary client: `PUBSUB CHANNELS`, then `PUBSUB NUMSUB` with the channels listed, and `PUBSUB NUMPAT`. Each request
 * carries a number; a reply older than the last request of its command is dropped (rule 5). A refused
 * `PUBSUB CHANNELS` puts the server's message in place of the list; a refused `NUMSUB` or `NUMPAT` leaves out what it
 * would have given.
 */
import { countArgs, isNewest, type ChannelsRead } from '../../../features/pubsub/channels';
import type { IntentResult } from '../../../shared/bridge';
import { startOn } from './pubsub-actions';
import { changePubSubTab, pubsubTabOf } from './pubsub-store';

let sent = 0;

function readOf(result: IntentResult): ChannelsRead | undefined {
  return result.kind === 'read' && typeof result.result === 'object' && result.result !== null
    ? (result.result as ChannelsRead)
    : undefined;
}

/** What the server answered to a command refused: its own words (`NOPERM …`), which the list says. */
function messageOf(result: IntentResult): string | undefined {
  if (result.kind === 'failed') {
    return result.details ?? result.message;
  }
  return result.kind === 'refused' ? result.message : undefined;
}

async function readCounts(tab: string, names: readonly Uint8Array[], number: number): Promise<void> {
  const state = pubsubTabOf(tab);
  if (state === undefined) {
    return;
  }
  const counting =
    names.length === 0
      ? Promise.resolve<IntentResult | undefined>(undefined)
      : startOn(state.connection, 'pubsub.channels', 'list', countArgs(names, number));
  const [counts, patterns] = await Promise.all([
    counting,
    startOn(state.connection, 'pubsub.channels', 'list', { command: 'numpat', sent: number }),
  ]);
  changePubSubTab(tab, (now) => {
    if (now.channelsSent !== number) {
      return now;
    }
    const counted = counts === undefined ? undefined : readOf(counts);
    const numpat = readOf(patterns);
    const { counts: _counts, patterns: _patterns, ...rest } = now.channels;
    return {
      ...now,
      channels: {
        ...rest,
        ...(counted?.command === 'numsub' ? { counts: counted } : {}),
        ...(numpat?.command === 'numpat' ? { patterns: numpat } : {}),
      },
    };
  });
}

/** Reads the list again: when the page opens, with **Refresh**, once the filter settles, and every 5 seconds. */
export async function readChannels(tab: string): Promise<void> {
  const state = pubsubTabOf(tab);
  if (state === undefined) {
    return;
  }
  sent += 1;
  const number = sent;
  changePubSubTab(tab, (now) => ({ ...now, channelsSent: number, channelsReadAt: Date.now() }));
  const result = await startOn(state.connection, 'pubsub.channels', 'list', {
    command: 'channels',
    filter: state.channelsFilter,
    sent: number,
  });
  const read = readOf(result);
  const now = pubsubTabOf(tab);
  if (now === undefined || !isNewest(read ?? { command: 'numpat', sent: number, patterns: 0 }, now.channelsSent)) {
    return;
  }
  if (read?.command !== 'channels') {
    const refused = messageOf(result);
    changePubSubTab(tab, (each) => ({ ...each, channels: refused === undefined ? {} : { refused } }));
    return;
  }
  changePubSubTab(tab, (each) => ({ ...each, channels: { ...each.channels, names: read } }));
  await readCounts(tab, read.names, number);
}
