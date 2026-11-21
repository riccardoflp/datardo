/**
 * The messages of the MCP server carried out (`mcp.protocol`, `mcp.server`): each JSON-RPC message answered by the
 * pure `answer`, and each call of a known tool stepped round after round by `toolStep`, its requests sent to the
 * engines and its app actions answered, until it ends. Every request passes the read-only guard first (R5.6): a
 * request that would write is never sent, whatever arguments the client crafted. A Redis request waits 30 s at most
 * (`mcp.output-limits`); a MongoDB one carries `maxTimeMS` and is given up a little after it. Each call of a known tool
 * is one line of the Log under the source **MCP** (`mcp.log`), never with the token.
 */
import type { EngineService } from '../../engines';
import { serverInstructions, toolStep, toolsOffered } from '../../features/mcp';
import type { McpLogEvent } from '../../features/mcp/log';
import { MAX_TIME_MS } from '../../features/mcp/output-limits';
import { answer, callAnswer, type MessageAnswer, type RpcResponse } from '../../features/mcp/protocol';
import { isReadingRequest, notSentSentence, toolActions } from '../../features/mcp/tool/read-only';
import {
  isTimedOut,
  type FailedReply,
  type TimedOutReply,
  type ToolArguments,
  type ToolDefinition,
  type ToolEnd,
} from '../../features/mcp/types';
import { withoutSecrets } from '../../features/runner/error';
import type { ConnectionRequest, Json } from '../../shared/engine-request';
import type { Context, Platform } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { appTarget } from '../../shared/target';

/** What the calls need from the main process: given by `src/main/mcp`, replaced in the tests. */
export interface CallPorts {
  readonly state: () => AppState;
  readonly engines: Pick<EngineService, 'send'>;
  /** Answers an app action a tool asks (`mcpActions`, `saved-query.list`); only those of the guard are passed. */
  readonly appAction: (action: string, args: Json, signal: AbortSignal) => Promise<unknown>;
  /** Writes a line of the Log under the source **MCP**. */
  readonly log: (event: McpLogEvent) => void;
  readonly version: string;
  readonly platform: Platform;
  readonly now: () => number;
  /** How long a Redis request is waited for: 30 s, shorter in a test. */
  readonly redisWaitMs?: number;
}

/** How much longer than its `maxTimeMS` a MongoDB request is waited for before it is given up. */
const mongoGraceMs = 15_000;

function failedReply(error: unknown): FailedReply {
  const record = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
  const message = error instanceof Error ? error.message : String(error);
  const code = record['code'];
  return {
    kind: 'error',
    message: withoutSecrets(message),
    ...(typeof code === 'number' || typeof code === 'string' ? { code } : {}),
  };
}

/** The reply of one request, or why it has none: refused by the guard, failed, or not answered in time. */
async function sendOne(ports: CallPorts, request: ConnectionRequest): Promise<unknown> {
  if (!isReadingRequest(request)) {
    return { kind: 'error', message: notSentSentence(request) } satisfies FailedReply;
  }
  const redis = request.request.engine === 'redis';
  const waitMs = redis ? (ports.redisWaitMs ?? MAX_TIME_MS) : MAX_TIME_MS + mongoGraceMs;
  const stop = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<TimedOutReply>((resolve) => {
    timer = setTimeout(() => {
      stop.abort();
      resolve({ kind: 'timed-out' });
    }, waitMs);
  });
  try {
    const sent = ports.engines.send(request, stop.signal).catch((error: unknown) => failedReply(error));
    const reply: unknown = await Promise.race([sent, late]);
    return isTimedOut(reply) && !redis ? failedReply(new Error('MongoDB did not answer in time.')) : reply;
  } finally {
    clearTimeout(timer);
  }
}

async function appReply(ports: CallPorts, action: string, args: Json): Promise<unknown> {
  if (!toolActions.has(action)) {
    return { kind: 'error', message: `Datardo's MCP server does not answer ${action}.` } satisfies FailedReply;
  }
  try {
    return await ports.appAction(action, args, AbortSignal.timeout(MAX_TIME_MS + mongoGraceMs));
  } catch (error: unknown) {
    return failedReply(error);
  }
}

/**
 * Runs a call of a tool to its end. The context is taken once, at the start, so that every round of the call reads
 * the same state, as the pure tool expects; a tool that throws ends with its message, masked.
 */
export async function runTool(ports: CallPorts, tool: ToolDefinition, args: ToolArguments): Promise<ToolEnd> {
  const context: Context = {
    feature: featureId(tool.group),
    now: ports.now(),
    platform: ports.platform,
    startedBy: 'mcp',
    target: appTarget,
    state: ports.state(),
  };
  const rounds: (readonly unknown[])[] = [];
  try {
    for (;;) {
      const step = toolStep(context, { tool: tool.name, arguments: args, rounds });
      switch (step.kind) {
        case 'answer':
        case 'fail':
          return step;
        case 'send':
          rounds.push(await Promise.all(step.requests.map((request) => sendOne(ports, request))));
          break;
        case 'app':
          rounds.push([await appReply(ports, step.action, step.args)]);
          break;
      }
    }
  } catch (error: unknown) {
    return { kind: 'fail', message: `${tool.name} failed: ${failedReply(error).message}` };
  }
}

/** The answer to one message, once its tool, if any, has ended; `undefined` for a notification. */
export async function answerMessage(ports: CallPorts, message: unknown): Promise<RpcResponse | undefined> {
  const state = ports.state();
  const answered: MessageAnswer = answer(message, toolsOffered(state.settings), {
    version: ports.version,
    instructions: serverInstructions(),
  });
  switch (answered.kind) {
    case 'none':
      return undefined;
    case 'response':
      if (answered.log !== undefined) {
        ports.log(answered.log);
      }
      return answered.response;
    case 'call': {
      const end = await runTool(ports, answered.tool, answered.arguments);
      const done = callAnswer(answered, end);
      ports.log(done.log);
      return done.response;
    }
  }
}
