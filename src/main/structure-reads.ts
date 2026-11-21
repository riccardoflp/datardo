/**
 * The read of the two structures the page starts (`structure.read`, the app action `structure.read-both`): each side
 * read phase after phase as the feature says (`request`, then `nextRequests` with every reply so far, then `parse`),
 * both sides at the same time, the requests of one phase sent together (the indexes 8 at a time). A request that
 * fails is a reply of its own, which the feature reads as a failure; nothing is written and no document is read.
 * The work in progress says *Reading the structures… left 3 of 12 collections, right 5 of 9 collections*.
 */
import type { EngineService } from '../engines';
import { nextRequests, parse, readProgress, request, type StructureRead } from '../features/structure/read';
import { text } from '../features/structure/text';
import type { ConnectionRequest, Json } from '../shared/engine-request';
import type { Context, Platform } from '../shared/feature';
import { featureId } from '../shared/ids';
import { Cancelled } from '../runner/cancel';
import type { ProgressReport, StateHolder } from '../runner/ports';

/** What the read needs of the main process. */
export interface StructureReadPorts {
  readonly engines: () => EngineService;
  readonly state: Pick<StateHolder, 'get'>;
  readonly now: () => number;
  readonly platform: Platform;
}

type SideProgress = { readonly done: number; readonly total: number } | undefined;

function contextOf(ports: StructureReadPorts): Context {
  return {
    feature: featureId('structure.read'),
    now: ports.now(),
    platform: ports.platform,
    startedBy: 'user',
    target: { kind: 'app' },
    state: ports.state.get(),
  };
}

/** The reply of a request, or its failure as `{ kind: 'error', message, code? }`, which the feature reads. */
async function replyOf(ports: StructureReadPorts, sent: ConnectionRequest, signal: AbortSignal): Promise<unknown> {
  try {
    return await ports.engines().send(sent, signal);
  } catch (error: unknown) {
    if (signal.aborted) {
      throw new Cancelled();
    }
    // The read takes its failures as replies: `parse` says what each means (no search, no shard keys, an error).
    const code = (error as { readonly code?: unknown }).code;
    const message = error instanceof Error ? error.message : String(error);
    return { kind: 'error', message, ...(typeof code === 'number' ? { code } : {}) };
  }
}

/** Reads the structure of one side to its end, saying how far it is after each phase. */
export async function readStructure(
  ports: StructureReadPorts,
  side: Json,
  signal: AbortSignal,
  onProgress: (progress: SideProgress) => void = () => undefined,
): Promise<StructureRead> {
  const first = request(contextOf(ports), side);
  const replies: unknown[] = [];
  let next: readonly ConnectionRequest[] = first.kind === 'engine' ? first.requests : [];
  while (next.length > 0) {
    if (signal.aborted) {
      throw new Cancelled();
    }
    replies.push(...(await Promise.all(next.map((each) => replyOf(ports, each, signal)))));
    onProgress(readProgress(replies));
    next = nextRequests(side, replies);
  }
  return parse(replies, side);
}

function sideText(progress: SideProgress): string {
  return progress === undefined ? text.show.unknownProgress : text.show.progress(progress.done, progress.total);
}

function sideOf(args: Json, name: 'left' | 'right'): Json {
  const fields = typeof args === 'object' && args !== null && !Array.isArray(args) ? args : {};
  return (fields as { readonly [key: string]: Json })[name] ?? null;
}

/** Reads both sides at the same time: `{ left, right }`, each a structure or the message of its failure. */
export async function readBoth(
  ports: StructureReadPorts,
  args: Json,
  signal: AbortSignal,
  progress?: ProgressReport,
): Promise<unknown> {
  const known: { left: SideProgress; right: SideProgress } = { left: undefined, right: undefined };
  const say = (): void => {
    progress?.({ detail: text.show.reading(sideText(known.left), sideText(known.right)) });
  };
  say();
  const [left, right] = await Promise.all(
    (['left', 'right'] as const).map((name) =>
      readStructure(ports, sideOf(args, name), signal, (read) => {
        known[name] = read;
        say();
      }),
    ),
  );
  return { left, right };
}
