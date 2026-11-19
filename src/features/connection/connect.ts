/**
 * Feature: connection.connect — opens the client of a connection the first time something needs it, with its TLS
 * settings and through its SSH tunnel, and learns what the server is.
 */
import type { ConnectionView, ServerInfo } from '../../shared/connection';
import type { Answers, AppStep, Context, Outcome, StartedBy } from '../../shared/feature';
import { noDanger, refuse, run } from '../../shared/feature';
import { connectionState } from '../../shared/state/connections';
import { isVersionAtLeast } from './server-info';
import { connectText, planText } from './text';
import { appStep, connectionsOf, nothingToDo, targetConnection } from './types';

/** The oldest Redis Datardo connects to (D11, R9.4). */
export const oldestRedis: readonly number[] = [6, 2];

/** How long the MongoDB driver has to find a server when connecting (connection.connect). */
export const mongoServerSelectionMs = 10_000;

/** How long a Redis server has to answer when connecting (Datardo's choice). */
export const redisConnectMs = 10_000;

/** The client name both engines give the server. */
export const clientName = 'datardo';

/** A refusal found once the server has answered: a Redis Cluster, a Sentinel, a server too old. */
export interface ServerRefusal {
  readonly code: string;
  readonly message: string;
}

/** Feature: connection.connect — why Datardo refuses the server it reached, if it does. */
export function serverRefusal(info: ServerInfo): ServerRefusal | undefined {
  if (info.engine === 'mongodb') {
    return undefined;
  }
  if (info.mode === 'cluster') {
    return { code: 'connection.connect/redis-cluster', message: connectText.redisCluster };
  }
  if (info.mode === 'sentinel') {
    return { code: 'connection.connect/redis-sentinel', message: connectText.redisSentinel };
  }
  return isVersionAtLeast(info.redisVersion, oldestRedis)
    ? undefined
    : { code: 'connection.connect/unsupported', message: connectText.tooOld(info.redisVersion) };
}

/**
 * The step that connects: `connect <name>`. Started by a scheduled task or a tool of the MCP server, an SSH host key
 * that is not known is refused without asking (connection.trust-host-key).
 */
export function connectStep(connection: ConnectionView, startedBy: StartedBy = 'user'): AppStep {
  return appStep(
    'engine.connect',
    { connection: connection.id, ...(startedBy === 'user' ? {} : { startedBy }) },
    planText.connect(connection.name),
  );
}

/** Why a connection cannot be connected before anything is tried: its secrets are not there. */
export function connectRefusal(context: Context, connection: ConnectionView): Outcome | undefined {
  if (connection.secrets.connectionString) {
    return undefined;
  }
  return connectionsOf(context.state).keychain
    ? refuse('connection.connect/no-connection-string', connectText.noConnectionString)
    : refuse('connection.connect/no-secrets', connectText.noSecrets(connection.name));
}

/** Feature: connection.connect — `connect <name>`, unless it is connected already or its secrets are missing. */
export function plan(context: Context, _answers: Answers): Outcome {
  const connection = targetConnection(context);
  if (connection === undefined) {
    return nothingToDo('Connect', planText.nothingToUndo);
  }
  const title = planText.connecting(connection.hosts);
  const state = connectionState(connectionsOf(context.state), connection.id);
  if (state === 'connected' || state === 'connecting') {
    return nothingToDo(title, planText.nothingToUndo);
  }
  const refusal = connectRefusal(context, connection);
  if (refusal !== undefined) {
    return refusal;
  }
  return run({
    title,
    steps: [connectStep(connection, context.startedBy)],
    danger: noDanger,
    undo: { cannot: planText.nothingToUndo },
    publishes: false,
    after: [],
  });
}
