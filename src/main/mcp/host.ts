/**
 * The MCP server in the main process (`mcp.server`, `mcp.access-token`, `mcp.change-port`, `mcp.log`): it listens on
 * `127.0.0.1` on the port it is given while `datardo.mcp.enabled` is on, says its state to the app's state (the top
 * bar's dot, `mcp.status`), tries a taken port again every 3 seconds without a second warning, and keeps the access
 * token in the secret storage. The token never goes to the state, the Log or an answer: it leaves the secret storage
 * only for the HTTP check and the copies of `mcp.setup`.
 */
import type { Server } from 'node:http';
import { tokenBytes, tokenText } from '../../features/mcp/access-token';
import { candidatePorts, movedNotice } from '../../features/mcp/change-port';
import { logLine, logSource, stateLine, type McpLogEvent } from '../../features/mcp/log';
import { listenProblem, notStartedAfter, retryMs } from '../../features/mcp/server';
import { claudeCommand, jsonConfiguration } from '../../features/mcp/setup';
import { mcpStateOf } from '../../features/mcp/tool/server-state';
import { serverUrl } from '../../features/mcp/types';
import type { After } from '../../shared/feature';
import type { McpServerState } from '../../shared/state/mcp';
import { notify } from '../../runner/notify';
import type { StateHolder } from '../../runner/ports';
import { answerMessage, type CallPorts } from './calls';
import { isPortFree, listenOn, stopListening } from './http';

/** The key of the access token in the secret storage (security, "Secrets"). */
export const tokenKey = 'mcp/token';

/** Where the token is kept: the secret storage of the main process. */
export interface TokenStore {
  readonly get: (key: string) => string | undefined;
  /** False when the secret storage may not be written (a newer file). */
  readonly set: (key: string, value: string) => boolean;
}

/** What the server needs: the state, the secret storage, random bytes, and what its calls need. */
export interface HostPorts {
  readonly state: StateHolder;
  readonly secrets: TokenStore;
  readonly randomBytes: (count: number) => Uint8Array;
  readonly calls: Omit<CallPorts, 'log' | 'state'>;
  /** How long it waits before it tries a taken port again: 3 s, shorter in a test. */
  readonly retryMs?: number;
}

/** The two copies of `mcp.setup`. */
export type ConfigurationForm = 'claude' | 'json';

/** The MCP server: off until {@link McpHost.start}. */
export class McpHost {
  private server: Server | undefined;
  /** The port it should listen on while it is on; `undefined` when off. */
  private wanted: number | undefined;
  /** The port it listened on or tried last while on, to say where it moved from. */
  private lastPort: number | undefined;
  /** Counts the starts and stops, so that a listen that ends after a newer one is dropped. */
  private generation = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private lastStateLine: string | undefined;
  private readonly freePorts = new Map<number, number | undefined>();

  constructor(private readonly ports: HostPorts) {}

  /** The port it listens on now, if it does. */
  listening(): number | undefined {
    return this.server === undefined ? undefined : this.wanted;
  }

  /** The token, stored first when there is none. */
  token(): string {
    return this.ports.secrets.get(tokenKey) ?? this.newToken(false);
  }

  /** Stores a new token of 32 random bytes; the old one gets 401 at once. Starts nothing. */
  newToken(logged = true): string {
    const token = tokenText(this.ports.randomBytes(tokenBytes));
    if (!this.ports.secrets.set(tokenKey, token)) {
      throw new Error('The access token could not be saved: the passwords were written by a newer version of Datardo.');
    }
    if (logged) {
      this.log({ kind: 'new-token' });
    }
    return token;
  }

  /** A copy of `mcp.setup`, with the token: the command for Claude Code, or the JSON configuration. */
  configuration(form: ConfigurationForm, port: number): string {
    const url = serverUrl(port);
    return form === 'claude' ? claudeCommand(url, this.token()) : jsonConfiguration(url, this.token());
  }

  /** Listens on the port, moving from the one it listened on; nothing when it already listens or tries there. */
  async start(port: number): Promise<void> {
    this.token();
    if (this.wanted === port) {
      return;
    }
    const from = this.lastPort !== undefined && this.lastPort !== port ? this.lastPort : undefined;
    this.close();
    this.wanted = port;
    this.lastPort = port;
    this.setServer({ kind: 'starting', port });
    await this.tryListen(port, from);
  }

  /** Stops listening at once; the calls in progress finish. Says so when it was on. */
  stop(): void {
    const wasOn = this.wanted !== undefined;
    this.close();
    this.wanted = undefined;
    this.lastPort = undefined;
    if (wasOn) {
      this.setServer({ kind: 'off' });
      this.log({ kind: 'stopped' });
    }
  }

  private close(): void {
    this.generation += 1;
    clearTimeout(this.retry);
    this.retry = undefined;
    if (this.server !== undefined) {
      stopListening(this.server);
      this.server = undefined;
    }
  }

  private async tryListen(port: number, from: number | undefined): Promise<void> {
    const generation = this.generation;
    try {
      const server = await listenOn(
        { token: () => this.token(), answerMessage: (message) => answerMessage(this.callPorts(), message) },
        port,
      );
      if (generation !== this.generation) {
        stopListening(server);
        return;
      }
      this.server = server;
      this.setServer({ kind: 'running', port });
      this.log({ kind: 'listening', url: serverUrl(port) });
      if (from !== undefined) {
        this.carryOut([movedNotice(port, from)], 'mcp.change-port');
      }
    } catch (error: unknown) {
      if (generation === this.generation) {
        await this.notStarted(port, error, generation);
      }
    }
  }

  private async notStarted(port: number, error: unknown, generation: number): Promise<void> {
    const code = (error as { code?: unknown }).code;
    const why = listenProblem(
      port,
      typeof code === 'string' ? code : undefined,
      error instanceof Error ? error.message : String(error),
    );
    const taken = code === 'EADDRINUSE';
    const freePort = taken ? await this.freePortFrom(port) : undefined;
    if (generation !== this.generation) {
      return;
    }
    this.setServer({ kind: 'not-running', port, why, taken, ...(freePort === undefined ? {} : { freePort }) });
    this.log({ kind: 'not-started', why });
    const warning = notStartedAfter(this.ports.state.get(), port, why);
    if (warning.length > 0) {
      this.ports.state.dispatch({ slice: 'mcp', type: 'warned', port });
      this.carryOut(warning, 'mcp.server');
    }
    this.retry = setTimeout(() => {
      if (generation === this.generation && this.wanted === port) {
        void this.tryListen(port, undefined);
      }
    }, this.ports.retryMs ?? retryMs);
  }

  /** The first free port from the next one, up to 50 further, found once per port. */
  private async freePortFrom(port: number): Promise<number | undefined> {
    if (!this.freePorts.has(port)) {
      let found: number | undefined;
      for (const candidate of candidatePorts(port)) {
        if (await isPortFree(candidate)) {
          found = candidate;
          break;
        }
      }
      this.freePorts.set(port, found);
    }
    return this.freePorts.get(port);
  }

  private setServer(server: McpServerState): void {
    if (JSON.stringify(mcpStateOf(this.ports.state.get()).server) !== JSON.stringify(server)) {
      this.ports.state.dispatch({ slice: 'mcp', type: 'server', server });
    }
  }

  private carryOut(afters: readonly After[], feature: string): void {
    for (const after of afters) {
      if (after.kind === 'notify') {
        notify(this.notifyPorts(), {
          feature,
          level: after.level,
          text: after.text,
          ...(after.actions === undefined ? {} : { actions: after.actions }),
        });
      }
    }
  }

  private notifyPorts(): Parameters<typeof notify>[0] {
    return { state: this.ports.state, now: this.ports.calls.now };
  }

  /** Writes a line under the source **MCP**: a state line once until it changes, every call. */
  private log(event: McpLogEvent): void {
    const line = event.kind === 'call' ? logLine(event) : stateLine(event, this.lastStateLine);
    if (event.kind !== 'call' && event.kind !== 'new-token') {
      this.lastStateLine = logLine(event);
    }
    if (line === undefined) {
      return;
    }
    const failed = event.kind === 'call' && event.outcome.kind !== 'ok';
    this.ports.state.dispatch({
      slice: 'runner',
      type: 'logged',
      lines: [{ time: this.ports.calls.now(), source: logSource, kind: failed ? 'error' : 'info', text: line }],
    });
  }

  private callPorts(): CallPorts {
    return {
      ...this.ports.calls,
      state: () => this.ports.state.get(),
      log: (event) => {
        this.log(event);
      },
    };
  }
}
