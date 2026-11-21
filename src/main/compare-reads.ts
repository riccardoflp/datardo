/**
 * The read of a comparison the page starts (`compare.read`, the app action `compare.compare`): the documents of the
 * left side, then of the right side, each through a kept cursor of `db.orders.find(<filter>)` read 1,000 at a time as
 * stored, into the pairing (`src/runner/workers`). Only the `_id`s and the hashes of the left side are kept, so that
 * 1,000,000 documents a side take memory proportional to their number (QA11). No sort, no projection, no time limit;
 * the progress reaches the work in progress at most every 200 ms; a cancelled read closes its cursor and its pairing.
 */
import type { EngineService } from '../engines';
import { filterOf, pairingInput, readArgs, type ReadArgs } from '../features/compare/read';
import { text } from '../features/compare/text';
import { batchSize, type Side, type SideRef } from '../features/compare/types';
import type { Json } from '../shared/engine-request';
import type { Context, Outcome, Platform } from '../shared/feature';
import { featureId } from '../shared/ids';
import { Cancelled } from '../runner/cancel';
import type { ProgressReport, StateHolder } from '../runner/ports';
import type { PairingStarter, PairingWork } from '../runner/workers/pairing';
import { collectionBytes } from './transfer-feeds';

/** How often the progress reaches the page at most, in milliseconds (`compare.read`, rule 5). */
export const progressEveryMs = 200;

/** What the read needs of the main process. */
export interface CompareReadPorts {
  readonly engines: () => EngineService;
  readonly state: Pick<StateHolder, 'get'>;
  readonly now: () => number;
  readonly platform: Platform;
  readonly pairing: PairingStarter;
}

function contextOf(ports: CompareReadPorts): Context {
  return {
    feature: featureId('compare.read'),
    now: ports.now(),
    platform: ports.platform,
    startedBy: 'user',
    target: { kind: 'app' },
    state: ports.state.get(),
  };
}

/** Says the progress, at most every 200 ms. */
function throttled(ports: CompareReadPorts, progress: ProgressReport | undefined): (detail: string) => void {
  let last = 0;
  return (detail) => {
    const now = ports.now();
    if (progress !== undefined && now - last >= progressEveryMs) {
      last = now;
      progress({ detail });
    }
  };
}

interface Reading {
  readonly ports: CompareReadPorts;
  readonly pairing: PairingWork;
  readonly filter: Json;
  readonly say: (detail: string) => void;
  readonly signal: AbortSignal;
}

/** Reads one side into the pairing; the refusal of a side with too many documents ends the read. */
async function readSide(reading: Reading, side: Side, on: SideRef): Promise<Outcome | undefined> {
  const where = { connection: on.connection, database: on.database, collection: on.collection, filter: reading.filter };
  for await (const batch of collectionBytes(reading.ports.engines(), where, batchSize, reading.signal)) {
    if (reading.signal.aborted) {
      throw new Cancelled();
    }
    const step = await reading.pairing.add(side, batch);
    if (step.kind === 'refuse') {
      return step;
    }
    reading.say(step.progress);
  }
  if (reading.signal.aborted) {
    throw new Cancelled();
  }
  return undefined;
}

async function pairBoth(reading: Reading, asked: ReadArgs): Promise<unknown> {
  reading.say(text.read.readingLeft('0'));
  const left = await readSide(reading, 'left', asked.left);
  if (left !== undefined) {
    return left;
  }
  const right = await readSide(reading, 'right', asked.right);
  return right ?? (await reading.pairing.finish());
}

/**
 * Compares the two sides: the result of `compare.read` (counts and every difference), or the refusal of the filter or
 * of a side with more than 1,000,000 documents, as data the page shows in its error line.
 */
export async function compareSides(
  ports: CompareReadPorts,
  args: Json,
  signal: AbortSignal,
  progress?: ProgressReport,
): Promise<unknown> {
  const context = contextOf(ports);
  const asked = readArgs(args);
  const filter = filterOf(asked.options, context.now);
  if ('kind' in filter) {
    return filter;
  }
  progress?.({ title: text.title(asked.left.collection, asked.right.collection) });
  const pairing = ports.pairing(pairingInput(context, asked));
  try {
    return await pairBoth({ ports, pairing, filter: filter.filter, say: throttled(ports, progress), signal }, asked);
  } finally {
    pairing.close();
  }
}
