/**
 * What the schema area does in the main process. The read of a sample (`schema.sample`, the app action
 * `schema.read-sample`): the count, then the documents, as the work the feature made says, then their analysis on a
 * worker thread (`src/runner/workers`); the tab's sample in the app's state says when it starts and how it ends, so
 * that the Schema section shows it however it was started. And the filter a feature puts in the query bar of a
 * collection tab (`query.set-filter`, for `schema.filter-from-value`), which the window then shows there.
 */
import type { EngineService } from '../engines';
import { countOfReply, documentsRequest, parse, type SampleReply, type SampleWork } from '../features/schema/sample';
import { withoutSecrets } from '../features/runner/error';
import { Cancelled } from '../runner/cancel';
import { analyzeSample, type AnalysisPlace } from '../runner/workers/analysis';
import type { StateHolder } from '../runner/ports';
import type { Json } from '../shared/engine-request';
import { connectionId, tabId, type TabId } from '../shared/ids';
import type { SampleEnd } from '../shared/state/schema';

/** What the read needs of the main process. */
export interface SamplePorts {
  readonly engines: () => EngineService;
  readonly state: StateHolder;
  readonly analysis: AnalysisPlace;
  readonly now: () => number;
}

function fieldOf(args: Json, name: string): Json | undefined {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as { readonly [key: string]: Json })[name]
    : undefined;
}

/** Drops what the state keeps for the tabs that are closed. */
function keepForOpenTabs(state: StateHolder): void {
  const tabs = state.get().tabs.tabs.map((tab) => tab.id);
  state.dispatch({ slice: 'schema', type: 'kept-for', tabs });
}

/** The tab's sample starts: its number, to end it with. */
function started(state: StateHolder, tab: TabId | undefined): number | undefined {
  if (tab === undefined) {
    return undefined;
  }
  keepForOpenTabs(state);
  state.dispatch({ slice: 'schema', type: 'sample-started', tab });
  return state.get().schema.samples[tab]?.number;
}

function ended(state: StateHolder, tab: TabId | undefined, number: number | undefined, end: SampleEnd): void {
  if (tab !== undefined && number !== undefined) {
    state.dispatch({ slice: 'schema', type: 'sample-ended', tab, number, end });
  }
}

async function readAndAnalyze(ports: SamplePorts, work: SampleWork, signal: AbortSignal): Promise<SampleReply> {
  const begun = ports.now();
  const connection = connectionId(work.connection);
  const engines = ports.engines();
  const count = countOfReply(await engines.send({ connection, request: work.count }, signal));
  const reply = await engines.send({ connection, request: documentsRequest(work, count) }, signal);
  const documents = Array.isArray(reply) ? (reply as readonly Json[]) : [];
  const summary = await analyzeSample(documents, signal, ports.analysis);
  return { count, summary, milliseconds: Math.max(0, Math.round(ports.now() - begun)) };
}

/** `schema.read-sample` with the work of `schema.sample`: its reply, and the tab's sample in the state. */
export async function readSample(ports: SamplePorts, args: Json, signal: AbortSignal): Promise<SampleReply> {
  const work = args as unknown as SampleWork;
  const tab = typeof work.tab === 'string' ? tabId(work.tab) : undefined;
  const number = started(ports.state, tab);
  try {
    const reply = await readAndAnalyze(ports, work, signal);
    ended(ports.state, tab, number, { kind: 'read', result: parse([reply]) as unknown as Json });
    return reply;
  } catch (error: unknown) {
    const cancelled = signal.aborted || error instanceof Cancelled;
    const message = withoutSecrets(error instanceof Error ? error.message : String(error));
    ended(ports.state, tab, number, cancelled ? { kind: 'cancelled' } : { kind: 'failed', message });
    // The read itself fails as well, so that the runner says so and the Log keeps it.
    throw cancelled ? new Cancelled() : error;
  }
}

/** `query.set-filter` `{ tab, filter }`: the window shows the filter in the query bar of the tab, and it blinks once. */
export function setFilter(state: StateHolder, args: Json): Promise<void> {
  const tab = fieldOf(args, 'tab');
  const filter = fieldOf(args, 'filter');
  if (typeof tab === 'string' && typeof filter === 'string') {
    state.dispatch({ slice: 'schema', type: 'filter-set', tab: tabId(tab), filter });
  }
  return Promise.resolve();
}
