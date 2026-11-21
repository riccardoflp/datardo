/**
 * The change streams of the Watch changes pages (`watch.stream`), kept open in the main process, one for each tab, and
 * the app steps of the page's controls. A stream asks the server again each time it answers; the change events it
 * gives go to the page's state (the part `watch` of the app's state), together, at most once every 150 milliseconds.
 * The window never holds a stream: it draws the pages from the state and starts the controls through the bridge.
 *
 * - `watch.open-stream` (the read `watch.stream`): closes the stream the page had, opens the new one and answers once
 *   the server answered for the first time;
 * - `watch.close-stream`, `watch.pause`, `watch.clear` and `watch.remember`: the app steps of `watch.stop`,
 *   `watch.pause`, `watch.clear` and the toggles, the search and the filter of the page.
 *
 * A page opens with its tab, and its stream opens by itself then (not for a tab restored at start: `tab.restore`);
 * closing the tab closes the stream and its cursor on the server. Nothing is written to a deployment.
 */
import type { EngineService } from '../engines';
import type { Json, MongoRequest } from '../shared/engine-request';
import type { Context, Platform } from '../shared/feature';
import { connectionId, featureId, tabId, type ConnectionId } from '../shared/ids';
import type { AppEvent, AppState } from '../shared/state';
import type { Tab } from '../shared/state/tabs';
import {
  type PageMessage,
  type WatchEvent,
  type WatchMemory,
  type WatchPage,
  type WatchPageEvent,
  type Watched,
} from '../shared/state/watch';
import type { AppAction, StateHolder } from '../runner/ports';
import { objectOf } from '../features/history/types';
import { memoryChange } from '../features/watch/page/remember';
import { preImagesRequest, recordsPreImages } from '../features/watch/show';
import { flushMs, parse, request, streamArgs, streamArgsOf, type StreamArgs } from '../features/watch/stream';
import { mostEvents } from '../features/watch/visible-events';
import { failedMessage, memoryOfTab, tabOf, watchedOfTab } from './watch-facts';

/** What the streams need of the main process. */
export interface WatchStreamPorts {
  readonly engines: () => EngineService;
  readonly state: StateHolder;
  readonly now: () => number;
  readonly platform: Platform;
}

/** A stream kept open for a tab. */
interface Kept {
  readonly tab: string;
  readonly connection: ConnectionId;
  readonly database: string;
  readonly args: StreamArgs;
  /** Aborts the opening of the stream, when the read that opens it is cancelled. */
  readonly controller: AbortController;
  /** Set once the stream is being closed: no more asking. */
  closing: boolean;
  /** The question in flight to the server, which the stream waits for before closing its cursor. */
  inflight?: Promise<unknown> | undefined;
  cursor?: string;
  /** The number of the next change event. */
  next: number;
  /** The change events received and not yet handed to the page. */
  pending: WatchEvent[];
  token?: Json | undefined;
  /** The token last handed to the page. */
  handed?: Json | undefined;
  /** When the change events were last handed to the page, and the timer of the next time. */
  flushedAt: number;
  timer?: ReturnType<typeof setTimeout>;
}

/** What the read `watch.stream` answers: whether the stream is open. */
export interface OpenedStream {
  readonly open: boolean;
  readonly message?: string;
}

function watchEvent(event: WatchPageEvent): AppEvent {
  return { slice: 'watch', ...event };
}

/** The streams of the pages, by tab. */
export class WatchStreams {
  private readonly kept = new Map<string, Kept>();

  constructor(private readonly ports: WatchStreamPorts) {}

  private dispatch(event: WatchPageEvent): void {
    this.ports.state.dispatch(watchEvent(event));
  }

  private page(tab: string): WatchPage | undefined {
    return this.ports.state.get().watch[tab];
  }

  private context(state: AppState, tab: string): Context {
    return {
      feature: featureId('watch.stream'),
      now: this.ports.now(),
      platform: this.ports.platform,
      startedBy: 'user',
      target: { kind: 'tab', tab: tabId(tab) },
      state,
    };
  }

  /** Whether a tab's stream is open. */
  isOpen(tab: string): boolean {
    return this.kept.has(tab);
  }

  /** The tabs whose streams are open. */
  openTabs(): readonly string[] {
    return [...this.kept.keys()];
  }

  /**
   * Hands the change events received to the page, with the last resume token; with nothing new, only when `always`
   * (the first answer of the server, which makes the page say **Watching**).
   */
  private flush(kept: Kept, invalidated = false, always = false): void {
    if (kept.timer !== undefined) {
      clearTimeout(kept.timer);
      delete kept.timer;
    }
    const events = kept.pending;
    if (events.length === 0 && kept.token === kept.handed && !invalidated && !always) {
      return;
    }
    kept.pending = [];
    kept.flushedAt = this.ports.now();
    kept.handed = kept.token;
    this.dispatch({
      kind: 'received',
      tab: kept.tab,
      events,
      ...(kept.token === undefined ? {} : { resumeToken: kept.token }),
      invalidated,
    });
  }

  /** Hands the change events to the page now, or once 150 milliseconds have passed since the last time. */
  private schedule(kept: Kept): void {
    if (kept.timer !== undefined || kept.pending.length === 0) {
      return;
    }
    const wait = Math.max(0, kept.flushedAt + flushMs - this.ports.now());
    kept.timer = setTimeout(() => {
      delete kept.timer;
      if (this.kept.get(kept.tab) === kept) {
        this.flush(kept);
      }
    }, wait);
  }

  private async send(kept: Pick<Kept, 'connection'>, sent: MongoRequest, signal: AbortSignal): Promise<unknown> {
    return this.ports.engines().send({ connection: kept.connection, request: sent }, signal);
  }

  /** Asks the server for the change events that came, and takes them; whether the stream was invalidated. */
  private async take(kept: Kept): Promise<boolean> {
    const asked = this.send(
      kept,
      {
        engine: 'mongodb',
        database: kept.database,
        method: 'changeStreamNext',
        arguments: [kept.cursor ?? '', { $numberInt: String(mostEvents) }],
      },
      kept.controller.signal,
    );
    kept.inflight = asked.catch(() => undefined);
    const reply = await asked;
    const batch = parse([reply], {
      ...kept.args,
      nextNumber: kept.next,
      receivedAt: this.ports.now(),
    });
    if (batch.kind !== 'events') {
      return false;
    }
    kept.next += batch.events.length;
    kept.pending.push(...batch.events);
    if (batch.resumeToken !== undefined) {
      kept.token = batch.resumeToken;
    }
    return batch.invalidated;
  }

  /** Asks again each time the server answers, until the stream is closed, invalidated or fails. */
  private async loop(kept: Kept): Promise<void> {
    try {
      while (!kept.closing) {
        const invalidated = await this.take(kept);
        if (this.kept.get(kept.tab) !== kept) {
          return;
        }
        if (invalidated) {
          await this.end(kept);
          this.flush(kept, true);
          return;
        }
        this.schedule(kept);
      }
    } catch (error: unknown) {
      if (kept.closing || this.kept.get(kept.tab) !== kept) {
        return;
      }
      await this.end(kept);
      this.flush(kept);
      this.dispatch({ kind: 'failed', tab: kept.tab, message: failedMessage(error) });
    }
  }

  /**
   * Forgets a stream and closes its cursor once the question in flight is answered (at most 1,000 milliseconds): a
   * cursor closed while the server is still waiting on it would stay open there. A cursor already gone is gone all
   * the same.
   */
  private async end(kept: Kept): Promise<void> {
    if (this.kept.get(kept.tab) === kept) {
      this.kept.delete(kept.tab);
    }
    kept.closing = true;
    await kept.inflight;
    const cursor = kept.cursor;
    if (cursor === undefined) {
      return;
    }
    delete kept.cursor;
    await this.send(
      kept,
      { engine: 'mongodb', database: kept.database, method: 'closeCursor', arguments: [cursor] },
      new AbortController().signal,
    ).catch(() => undefined);
  }

  /** Closes the stream of a tab, handing the page what it received; whether there was one. */
  async close(tab: string): Promise<boolean> {
    const kept = this.kept.get(tab);
    if (kept === undefined) {
      return false;
    }
    await this.end(kept);
    if (this.page(tab) !== undefined) {
      this.flush(kept);
    }
    return true;
  }

  /** Remembers the filter and the options of a page, in the page and in its tab. */
  remember(tab: string, change: Partial<WatchMemory>): void {
    if (this.page(tab) === undefined || Object.keys(change).length === 0) {
      return;
    }
    this.dispatch({ kind: 'remembered', tab, memory: change });
    const page = this.page(tab);
    const open = this.ports.state.get().tabs.tabs.find((each) => each.id === tab);
    if (page === undefined || open === undefined) {
      return;
    }
    const watch = {
      filter: page.filter,
      fullDocument: page.fullDocument,
      hiddenTypes: page.hiddenTypes,
      search: page.search,
    };
    this.ports.state.dispatch({ slice: 'tabs', type: 'changed', tab: tabId(tab), memory: { ...open.memory, watch } });
  }

  /** The stream to open as `watch.stream` asks it, asking the version of the server first when it is not known. */
  private async asked(
    args: StreamArgs,
    signal: AbortSignal,
  ): Promise<MongoRequest | Exclude<PageMessage, { kind: 'invalidated' }>> {
    let given = args;
    for (let tries = 0; tries < 2; tries += 1) {
      const outcome = request(this.context(this.ports.state.get(), args.tab), given as unknown as Json);
      if (outcome.kind === 'refuse') {
        return outcome.code === 'watch.stream/standalone'
          ? { kind: 'standalone', text: outcome.message }
          : { kind: 'error', text: outcome.message };
      }
      if (outcome.kind !== 'engine' || outcome.requests[0] === undefined) {
        break;
      }
      const sent = outcome.requests[0].request as MongoRequest;
      if (sent.method !== 'runCommand') {
        return sent;
      }
      const reply = await this.send({ connection: connectionId(args.connection) }, sent, signal);
      const version = parse([reply], given as unknown as Json);
      if (version.kind !== 'version') {
        break;
      }
      this.dispatch({ kind: 'server-version', tab: args.tab, version: version.version });
      given = { ...given, serverVersion: version.version };
    }
    throw new Error('Datardo could not tell the version of the server.');
  }

  /**
   * `watch.open-stream`: closes the stream the page had and opens this one; answers once the server answered for the
   * first time, also with nothing. What goes wrong is said on the page.
   */
  async open(args: Json, signal: AbortSignal): Promise<OpenedStream> {
    const given = streamArgsOf(args);
    if (given === undefined) {
      throw new Error('watch.stream needs the arguments of a page.');
    }
    const { tab } = given;
    await this.close(tab);
    const page = this.page(tab);
    if (page === undefined) {
      return { open: false };
    }
    this.remember(tab, { filter: given.filter, fullDocument: given.fullDocument });
    this.dispatch({ kind: 'starting', tab });
    const controller = new AbortController();
    const stop = (): void => {
      controller.abort();
    };
    signal.addEventListener('abort', stop, { once: true });
    const kept: Kept = {
      tab,
      connection: connectionId(given.connection),
      database: given.database ?? 'admin',
      args: { ...given, ...(page.serverVersion === undefined ? {} : { serverVersion: page.serverVersion }) },
      controller,
      closing: false,
      next: Math.max(given.nextNumber, page.nextNumber),
      pending: [],
      flushedAt: 0,
    };
    this.kept.set(tab, kept);
    try {
      return await this.start(kept);
    } catch (error: unknown) {
      if (this.kept.get(tab) !== kept) {
        return { open: false };
      }
      await this.end(kept);
      const message = failedMessage(error);
      this.dispatch({ kind: 'failed', tab, message });
      return { open: false, message: message.text };
    } finally {
      signal.removeEventListener('abort', stop);
    }
  }

  /** Opens a stream kept for its tab and takes the first answer of the server; then asks again and again. */
  private async start(kept: Kept): Promise<OpenedStream> {
    const { tab, controller } = kept;
    const sent = await this.asked(kept.args, controller.signal);
    if (!('engine' in sent)) {
      this.kept.delete(tab);
      this.dispatch({ kind: 'failed', tab, message: sent });
      return { open: false, message: sent.text };
    }
    const reply = await this.send(kept, { ...sent, method: 'openChangeStream' }, controller.signal);
    const cursor = objectOf(reply as Json)['cursor'];
    if (typeof cursor !== 'string') {
      throw new Error('The change stream could not be opened.');
    }
    kept.cursor = cursor;
    if (this.kept.get(tab) !== kept || controller.signal.aborted) {
      await this.end(kept);
      return { open: false };
    }
    const invalidated = await this.take(kept);
    if (invalidated) {
      await this.end(kept);
      this.flush(kept, true);
      return { open: false };
    }
    this.flush(kept, false, true);
    void this.loop(kept);
    return { open: true };
  }

  /** Reads whether the collection of a page records pre-images; nothing for a database or the deployment. */
  async readPreImages(tab: string): Promise<void> {
    const watched = this.page(tab)?.watched;
    if (watched?.database === undefined || watched.collection === undefined) {
      return;
    }
    try {
      const reply = await this.send(
        { connection: connectionId(watched.connection) },
        preImagesRequest(watched.database, watched.collection),
        new AbortController().signal,
      );
      if (this.page(tab) !== undefined) {
        this.dispatch({ kind: 'pre-images', tab, recorded: recordsPreImages(reply) });
      }
    } catch {
      // Not known: the page shows nothing about pre-images.
    }
  }

  /** The page of a tab just opened (or restored): stopped, with what its tab remembers. */
  opened(tab: Tab): Watched | undefined {
    const watched = watchedOfTab(tab);
    if (watched !== undefined && this.page(tab.id) === undefined) {
      this.dispatch({ kind: 'opened', tab: tab.id, watched, memory: memoryOfTab(tab) });
    }
    return watched;
  }

  /** The arguments that open the stream of a page from now. */
  streamOf(tab: string): Json | undefined {
    const page = this.page(tab);
    return page === undefined ? undefined : (streamArgs(tab, page, 'now') as unknown as Json);
  }

  /** The tab is closed: its stream is closed and its page forgotten. */
  async closed(tab: string): Promise<void> {
    await this.close(tab);
    this.dispatch({ kind: 'closed', tab });
  }

  /** Closes every stream: when Datardo quits. */
  async closeAll(): Promise<void> {
    await Promise.all(this.openTabs().map((tab) => this.close(tab)));
  }

  /** The app steps and the app read of the pages, by name. */
  actions(): Readonly<Record<string, AppAction>> {
    return {
      'watch.open-stream': (args, signal) => this.open(args, signal),
      'watch.close-stream': async (args) => {
        const tab = tabOf(args);
        await this.close(tab);
        if (this.page(tab) !== undefined) {
          this.dispatch({ kind: 'stopped', tab });
        }
        return null;
      },
      'watch.pause': (args) => {
        this.dispatch({ kind: 'paused', tab: tabOf(args), paused: objectOf(args)['paused'] === true });
        return Promise.resolve(null);
      },
      'watch.clear': (args) => {
        this.dispatch({ kind: 'cleared', tab: tabOf(args) });
        return Promise.resolve(null);
      },
      'watch.remember': (args) => {
        this.remember(tabOf(args), memoryChange(args));
        return Promise.resolve(null);
      },
    };
  }
}
