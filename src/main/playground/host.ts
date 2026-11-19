/**
 * The runs of the playgrounds in the main process (`playground.run`, `playground.stop`, D51, T6): one at a time, each
 * in a process started for it, which the host gives the rewritten text and whose calls it answers. The run is work in
 * progress on the status line (`runner.progress`), whose **Cancel** stops it like **Stop**. When it ends, fails or is
 * stopped, the process is ended, what the run left open is closed, the result is shown, and the Log has its lines
 * under **Playground**.
 */
import type { Json } from '../../shared/engine-request';
import { featureId, type ConnectionId, type TabId } from '../../shared/ids';
import type { PlaygroundRun, RunError, RunResult } from '../../shared/state/playgrounds';
import { publishingOf } from '../../features/oplog/types';
import { endedResult, failedLine, startLine, type RunEnd } from '../../features/playground/results/ending';
import type { FromRun, ToRun } from '../../features/playground/runtime/calls';
import type { CloseReason } from '../../features/playground/sessions';
import { stoppedResult } from '../../features/playground/stop';
import { text } from '../../features/playground/text';
import { writeLog } from '../../runner/log';
import type { RunnerPorts } from '../../runner/ports';
import { runtimeOf } from '../../runner/runtime';
import type { RunningWork } from '../../runner/work';
import { answerCall } from './answer';
import { logSource } from './drops';
import { CallError, runContext, type RunContext } from './run-context';
import { closeRun } from './sessions';

/** The process of one run, as the host drives it. */
export interface RunProcess {
  readonly post: (message: ToRun) => void;
  readonly onMessage: (listener: (message: FromRun) => void) => void;
  /** Called once, when the process is gone: ended, killed, or out of memory. */
  readonly onExit: (listener: () => void) => void;
  /** Ends the process at once, without waiting for the script. */
  readonly kill: () => void;
}

/** Starts the process of a run. */
export type Launcher = () => RunProcess;

/** What the step `run <title> on <connection> â€º <database>` gives the host (`playground.run`, `runArgs`). */
export interface RunArgs {
  readonly tab: TabId;
  readonly title: string;
  readonly connection: ConnectionId;
  readonly database: string;
  readonly firstLine: number;
  /** The rewritten text; absent when the text did not parse. */
  readonly code?: string;
  /** The syntax error, when the text did not parse: the result, with no process. */
  readonly error?: RunError;
  /** Whether the text that ran holds a word of writing: the tree and the pages are read again after. */
  readonly writes: boolean;
}

const runFeature = featureId('playground.run');

/** One run in progress. */
class Run {
  readonly output: string[] = [];
  readonly context: RunContext;
  readonly work: RunningWork;
  readonly process: RunProcess;
  private readonly controller = new AbortController();
  private finished = false;
  private readonly done: Promise<void>;
  private resolveDone: () => void = () => undefined;

  constructor(
    readonly ports: RunnerPorts,
    readonly run: PlaygroundRun,
    readonly args: RunArgs,
    parts: { readonly work: RunningWork; readonly process: RunProcess },
  ) {
    this.work = parts.work;
    this.process = parts.process;
    const state = ports.state.get();
    this.context = runContext(
      ports,
      run,
      {
        id: run.connection,
        name: run.connectionName,
        readOnly: ports.isReadOnly(run.connection),
        publishes: publishingOf(state, run.connection).kind !== 'none',
      },
      this.controller.signal,
    );
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
  }

  /** Ends when the run has ended and its result is shown. */
  get ended(): Promise<void> {
    return this.done;
  }

  start(code: string): void {
    this.process.onMessage((message) => {
      this.received(message);
    });
    this.process.onExit(() => {
      void this.finish({ kind: 'process-ended' }, 'error');
    });
    this.work.signal.addEventListener('abort', () => {
      this.stop();
    });
    this.process.post({ kind: 'start', code, database: this.run.database, firstLine: this.run.firstLine });
  }

  /** Ends the run at once: the process is ended, the drop waiting closes, what is being sent is no longer waited for. */
  stop(): void {
    if (this.finished) {
      return;
    }
    this.controller.abort();
    this.process.kill();
    void this.finish(undefined, 'cancel');
  }

  private post(message: ToRun): void {
    if (!this.finished) {
      this.process.post(message);
    }
  }

  private received(message: FromRun): void {
    switch (message.kind) {
      case 'call':
        void this.answer(message.id, message.call);
        return;
      case 'print':
        this.output.push(message.line);
        this.log('info', message.line);
        return;
      case 'done':
        void this.finish(message, 'end');
        return;
      case 'failed':
        void this.finish(message, 'error');
        return;
    }
  }

  private async answer(id: number, call: Extract<FromRun, { kind: 'call' }>['call']): Promise<void> {
    try {
      const value: Json = await answerCall(this.context, call);
      this.post({ kind: 'reply', id, value });
    } catch (error: unknown) {
      const failed = error instanceof CallError ? error : new CallError(String(error));
      this.post({
        kind: 'throw',
        id,
        error: { message: failed.message, ...(call.line === undefined ? {} : { line: call.line }) },
        ...(failed.labels.length === 0 ? {} : { labels: failed.labels }),
      });
    }
  }

  private log(kind: 'info' | 'error', line: string): void {
    writeLog(this.ports, [{ feature: logSource, kind, text: line, connection: this.run.connection }]);
  }

  /** The end of the run, once: the process ended, what is open closed, the result shown. */
  private async finish(end: RunEnd | undefined, reason: CloseReason): Promise<void> {
    if (this.finished) {
      return;
    }
    this.finished = true;
    if (end?.kind !== 'process-ended') {
      this.process.kill();
    }
    const notes = await closeRun(this.context, reason);
    const endedAt = this.ports.now();
    const result: RunResult =
      end === undefined
        ? stoppedResult(
            {
              title: this.run.title,
              connectionName: this.run.connectionName,
              database: this.run.database,
              durationMs: Math.max(0, endedAt - this.run.startedAt),
              output: this.output,
            },
            notes,
          )
        : endedResult({ run: this.run, endedAt, output: this.output, notes, end });
    this.show(result);
  }

  private show(result: RunResult): void {
    const { ports, run } = this;
    for (const note of result.output.slice(this.output.length)) {
      this.log('info', note);
    }
    const failed = failedLine(result);
    if (failed !== undefined) {
      this.log('error', failed);
    }
    ports.state.dispatch({ slice: 'playgrounds', type: 'run-ended', tab: run.tab, result });
    this.work.end();
    if (this.args.writes) {
      ports.state.dispatch({ slice: 'runner', type: 'refresh-asked', connection: run.connection });
    }
    this.resolveDone();
  }
}

/** The runs of the playgrounds: one at a time. */
export class PlaygroundHost {
  private current: Run | undefined;

  /** A host that starts the process of each run with `launch`. */
  constructor(private readonly launch: Launcher) {}

  /** Whether a run is in progress. */
  get running(): boolean {
    return this.current !== undefined;
  }

  /**
   * Starts a run and returns once it has started; `ended` resolves when its result is shown. A text that did not
   * parse is its result at once, with no process.
   */
  start(ports: RunnerPorts, args: RunArgs): { readonly ended: Promise<void> } {
    if (this.current !== undefined) {
      throw new Error(text.run.running);
    }
    const run: PlaygroundRun = {
      tab: args.tab,
      title: args.title,
      connection: args.connection,
      connectionName: ports.connectionName(args.connection),
      database: args.database,
      startedAt: ports.now(),
      firstLine: args.firstLine,
    };
    if (args.code === undefined) {
      this.syntaxError(ports, run, args.error ?? { message: text.run.syntaxError('') });
      return { ended: Promise.resolve() };
    }
    ports.state.dispatch({ slice: 'playgrounds', type: 'run-started', run });
    writeLog(ports, [{ feature: logSource, kind: 'info', text: startLine(run), connection: run.connection }]);
    const work = runtimeOf(ports).work.begin({
      feature: runFeature,
      title: text.run.work(run.title),
      connection: run.connection,
    });
    const started = new Run(ports, run, args, { work, process: this.launch() });
    this.current = started;
    void started.ended.then(() => {
      if (this.current === started) {
        this.current = undefined;
      }
    });
    started.start(args.code);
    return { ended: started.ended };
  }

  /** Stops the run in progress, if any; resolves once its result is shown. */
  async stop(): Promise<void> {
    const running = this.current;
    if (running !== undefined) {
      running.stop();
      await running.ended;
    }
  }

  private syntaxError(ports: RunnerPorts, run: PlaygroundRun, error: RunError): void {
    ports.state.dispatch({ slice: 'playgrounds', type: 'run-started', run });
    const result: RunResult = {
      title: run.title,
      connectionName: run.connectionName,
      database: run.database,
      durationMs: 0,
      value: { kind: 'none' },
      output: [],
      error,
    };
    const failed = failedLine(result);
    if (failed !== undefined) {
      writeLog(ports, [{ feature: logSource, kind: 'error', text: failed, connection: run.connection }]);
    }
    ports.state.dispatch({ slice: 'playgrounds', type: 'run-ended', tab: run.tab, result });
  }
}
