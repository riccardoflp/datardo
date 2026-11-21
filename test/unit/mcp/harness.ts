/**
 * What the unit tests of the MCP server's area build their inputs from: the connections Local (MongoDB) and Cache
 * local (Redis), both connected, a context at a fixed time with the settings given, and a driver that steps a tool's
 * call round after round, answering each request with the replies a test gives, as `src/main/mcp` will.
 */
import type { ConnectionView } from '../../../src/shared/connection';
import type { ConnectionRequest, Json, MongoRequest, RedisRequest } from '../../../src/shared/engine-request';
import type { Context, Outcome, Plan } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import type { McpServerState } from '../../../src/shared/state/mcp';
import { toolStep } from '../../../src/features/mcp';
import type { ToolArguments, ToolEnd } from '../../../src/features/mcp/types';
import { mongoConnection, redisConnection, stateWith } from '../connection/context';

/** Local: a MongoDB connection. */
export const local: ConnectionView = mongoConnection();

/** Cache local: a Redis connection. */
export const cache: ConnectionView = redisConnection();

/** Prod: a read-only MongoDB connection. */
export const prod: ConnectionView = mongoConnection({ id: connectionId('c-prod'), name: 'Prod', readOnly: true });

/** 17 November 2025, 17:20 UTC. */
export const now = 1_763_400_000_000;

/** What a state is made with. */
export interface StateOptions {
  readonly settings?: Readonly<Record<string, Json>>;
  readonly server?: McpServerState;
  readonly warnedPorts?: readonly number[];
  readonly connections?: readonly ConnectionView[];
  readonly connected?: boolean;
}

/** The app's state with Local and Cache local connected, the settings given, and the server's state. */
export function mcpState(options: StateOptions = {}): AppState {
  const connections = options.connections ?? [local, cache];
  const state = stateWith(
    connections,
    options.connected === false ? {} : Object.fromEntries(connections.map((each) => [each.id, 'connected'])),
  );
  const withSettings: AppState = { ...state, settings: { ...state.settings, stored: { ...options.settings } } };
  return {
    ...withSettings,
    mcp: { server: options.server ?? { kind: 'off' }, warnedPorts: options.warnedPorts ?? [] },
  };
}

/** A context of a feature of this area, started by the user, at {@link now}. */
export function mcpContext(feature: string, state: AppState = mcpState(), place?: Context['place']): Context {
  return {
    feature: featureId(feature),
    now,
    platform: 'windows',
    startedBy: place === undefined ? 'user' : 'user',
    ...(place === undefined ? {} : { place }),
    target: { kind: 'app' },
    state,
  };
}

/** The plan of an outcome that runs. */
export function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

/** How a test answers the requests to the engines and the app actions. */
export interface Replies {
  readonly mongo?: (request: MongoRequest) => unknown;
  readonly redis?: (words: readonly string[], database: number) => unknown;
  readonly app?: (action: string, args: Json) => unknown;
}

/** What a call did: how it ended, and what it sent. */
export interface Driven {
  readonly end: ToolEnd;
  readonly sent: readonly ConnectionRequest[];
  readonly apps: readonly { readonly action: string; readonly args: Json }[];
}

const decoder = new TextDecoder();

/** The words of a Redis request as text. */
export function wordsOf(request: RedisRequest): readonly string[] {
  return request.command.map((word) => decoder.decode(word));
}

/** The name of a MongoDB request: `runCommand:hello`, `find`, `aggregate`. */
export function nameOf(request: MongoRequest): string {
  if (request.method === 'runCommand') {
    const [command] = request.arguments;
    return `runCommand:${Object.keys((command ?? {}) as Record<string, unknown>)[0] ?? ''}`;
  }
  return request.method;
}

function replyTo(request: ConnectionRequest, replies: Replies): unknown {
  const asked = request.request;
  const reply = asked.engine === 'mongodb' ? replies.mongo?.(asked) : replies.redis?.(wordsOf(asked), asked.database);
  if (reply !== undefined) {
    return reply;
  }
  return { kind: 'error', message: asked.engine === 'mongodb' ? `no reply for ${nameOf(asked)}` : 'no reply' };
}

/** Steps a call of a tool until it ends, answering each round. */
export function drive(tool: string, args: ToolArguments, replies: Replies = {}, state: AppState = mcpState()): Driven {
  const rounds: (readonly unknown[])[] = [];
  const sent: ConnectionRequest[] = [];
  const apps: { action: string; args: Json }[] = [];
  const context = mcpContext(`mcp.${tool}`, state);
  for (let round = 0; round < 70; round += 1) {
    const step = toolStep(context, { tool, arguments: args, rounds });
    if (step.kind === 'answer' || step.kind === 'fail') {
      return { end: step, sent, apps };
    }
    if (step.kind === 'send') {
      sent.push(...step.requests);
      rounds.push(step.requests.map((each) => replyTo(each, replies)));
    } else {
      apps.push({ action: step.action, args: step.args });
      rounds.push([replies.app?.(step.action, step.args) ?? { kind: 'error', message: `no reply for ${step.action}` }]);
    }
  }
  throw new Error('The tool did not end');
}

/** The text of a call that answered, or a failure of the test with its message. */
export function answerOf(driven: Driven): string {
  if (driven.end.kind !== 'answer') {
    throw new Error(`Expected an answer, got: ${driven.end.message}`);
  }
  return driven.end.text;
}

/** The sentence of a call that failed. */
export function failureOf(driven: Driven): string {
  if (driven.end.kind !== 'fail') {
    throw new Error(`Expected a failure, got: ${driven.end.text}`);
  }
  return driven.end.message;
}

/** A failed reply, as the main process gives it for a request that failed. */
export function failed(message: string, code?: number): { kind: 'error'; message: string; code?: number } {
  return { kind: 'error', message, ...(code === undefined ? {} : { code }) };
}

/** `{ $numberLong: "…" }` of a number. */
export function long(value: number): Json {
  return { $numberLong: String(value) };
}

/** `{ $date: { $numberLong } }` of a time. */
export function date(milliseconds: number): Json {
  return { $date: { $numberLong: String(milliseconds) } };
}

/** `{ $timestamp: { t, i } }`. */
export function timestamp(seconds: number, increment = 1): Json {
  return { $timestamp: { t: seconds, i: increment } };
}

/** A `hello` of a replica set member, a standalone server, or a mongos. */
export function hello(kind: 'primary' | 'standalone' | 'mongos'): Json {
  if (kind === 'mongos') {
    return { isWritablePrimary: true, msg: 'isdbgrid', ok: 1 };
  }
  return kind === 'standalone'
    ? { isWritablePrimary: true, me: 'host:27017', ok: 1 }
    : {
        isWritablePrimary: true,
        setName: 'rs0',
        hosts: ['host:27017'],
        primary: 'host:27017',
        me: 'host:27017',
        ok: 1,
      };
}

/** A Redis string reply, as the engine gives it: bytes. */
export function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
