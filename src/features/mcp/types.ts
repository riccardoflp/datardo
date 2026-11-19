/**
 * What the features of the MCP area share: how a tool is declared (its name, its title, its description, the schema
 * of its arguments, whether it returns data), how a call of a tool is carried out without a single side effect in this
 * folder, and the app actions the main process answers for the tools.
 *
 * A tool is pure: it is called with the replies of the rounds it already asked for, and says what it needs next (`send`
 * requests to an engine, ask the main process an `app` action) or ends (`answer` with its text, `fail` with a sentence
 * for the model). `src/main/mcp` calls it again with each round's replies until it ends.
 */
import type { ConnectionRequest, Json } from '../../shared/engine-request';

/** The cards whose tools the server offers, one group of tools each. */
export type ToolGroup =
  | 'mcp.data-tools'
  | 'mcp.debugging-tools'
  | 'mcp.performance-tools'
  | 'mcp.deployment-tools'
  | 'mcp.data-model-tools'
  | 'mcp.redis-key-tools'
  | 'mcp.redis-server-tools'
  | 'mcp.tab-tools';

/** The JSON Schema of one argument of a tool, as `tools/list` gives it. */
export interface PropertySchema {
  readonly type: 'string' | 'integer' | 'number' | 'boolean' | 'array';
  readonly description?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly default?: Json;
  readonly enum?: readonly Json[];
  readonly items?: { readonly type: 'string'; readonly enum?: readonly string[] };
}

/** The JSON Schema of the arguments of a tool: an object, with its required keys. */
export interface InputSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, PropertySchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties: false;
}

/** A tool as the server declares it (`mcp.protocol`, `tools/list`). */
export interface ToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: InputSchema;
  /** Whether it returns documents, field values or values of keys: offered only with `datardo.mcp.readData`. */
  readonly readsData: boolean;
  /** The card that describes it. */
  readonly group: ToolGroup;
}

/** The arguments of a call, as the client sent them: anything, checked by `mcp.arguments`. */
export type ToolArguments = Readonly<Record<string, unknown>>;

/** A call of a tool, with the replies of the rounds it already asked for, in order. */
export interface ToolCall {
  readonly tool: string;
  readonly arguments: ToolArguments;
  /** The replies of each round, in the order of its requests; a failed request is `{ kind: 'error', message }`. */
  readonly rounds: readonly (readonly unknown[])[];
}

/** What a tool needs next, or how it ended. */
export type ToolStep =
  | { readonly kind: 'send'; readonly requests: readonly ConnectionRequest[] }
  | { readonly kind: 'app'; readonly action: string; readonly args: Json }
  | { readonly kind: 'answer'; readonly text: string }
  | { readonly kind: 'fail'; readonly message: string };

/** How a call ended: the text the model reads, and whether it is an error (`isError: true`). */
export type ToolEnd = Extract<ToolStep, { readonly kind: 'answer' | 'fail' }>;

/**
 * The app actions the main process answers for the tools, with the reply each gives:
 *
 * - `mcp.connect` `{ connection }`: connects it as opening it in the window would, without any dialog; replies
 *   `"connected"`, or `"needs-the-user"` when only the user can answer (an SSH host key, a password not saved).
 * - `mcp.undo-history` `{ connection?, database?, collection?, limit }`: the operations of the undo history, newest
 *   first, as {@link UndoHistoryReply} of `debugging-tools`.
 * - `mcp.undo-write` `{ id, limit }`: what one operation kept, as `UndoWriteReply` of `debugging-tools`.
 * - `mcp.open-tab` `{ intent }`: starts the intent (`tab.open` or a page's feature) and replies `{ hidden }`, true when
 *   the window is hidden in the tray.
 * - `mcp.free-port` `{ from }`: the first port from `from`, up to 50 further, that nothing listens on, or `null`.
 * - `saved-query.list`: the saved and recent queries of a collection, as `saved-query.list` reads them.
 */
export const mcpActions = {
  connect: 'mcp.connect',
  undoHistory: 'mcp.undo-history',
  undoWrite: 'mcp.undo-write',
  openTab: 'mcp.open-tab',
  freePort: 'mcp.free-port',
} as const;

/** The reply of a request that failed, as the main process gives it in place of the reply. */
export interface FailedReply {
  readonly kind: 'error';
  readonly message: string;
  /** The server's code, when it gave one: MongoDB's `13` (Unauthorized). */
  readonly code?: number | string;
}

/** The reply of a request to Redis that got no answer within the time limit (`mcp.output-limits`). */
export interface TimedOutReply {
  readonly kind: 'timed-out';
}

/** Whether a reply is a failure of its request, and not a reply. */
export function isFailed(reply: unknown): reply is FailedReply {
  return (
    typeof reply === 'object' &&
    reply !== null &&
    !Array.isArray(reply) &&
    (reply as Record<string, unknown>)['kind'] === 'error' &&
    typeof (reply as Record<string, unknown>)['message'] === 'string'
  );
}

/** Whether a reply says that Redis did not answer in time. */
export function isTimedOut(reply: unknown): reply is TimedOutReply {
  return typeof reply === 'object' && reply !== null && (reply as Record<string, unknown>)['kind'] === 'timed-out';
}

/** The settings the area reads, as numbers and switches. */
export interface McpSettings {
  readonly enabled: boolean;
  readonly port: number;
  readonly readData: boolean;
}

/** The default port (Datardo's choice, so that Mongoster's server on 37017 can run beside it). */
export const defaultPort = 37018;

/** The lowest port the server may use. */
export const lowestPort = 1024;

/** The highest port. */
export const highestPort = 65535;

/** The path of the server. */
export const mcpPath = '/mcp';

/** The address the AI clients are given: `http://127.0.0.1:37018/mcp`. */
export function serverUrl(port: number): string {
  return `http://127.0.0.1:${String(port)}${mcpPath}`;
}
