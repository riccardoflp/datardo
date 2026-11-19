/**
 * Feature: mcp.protocol
 *
 * The JSON-RPC 2.0 messages of the Model Context Protocol the server understands (`initialize`, `ping`, `tools/list`,
 * `tools/call`), answered as plain JSON, and how a tool's success or failure reaches the model: a failure is a result
 * with `isError: true` and a sentence the model can act on, never a protocol error. A tool is carried out by
 * `src/main/mcp` between {@link answer}, which finds it and checks its arguments, and {@link callAnswer}, which turns
 * its end into the result.
 */
import type { Json } from '../../shared/engine-request';
import type { McpLogEvent } from './log';
import type { ToolArguments, ToolDefinition, ToolEnd } from './types';

/** The versions of the protocol answered as asked; any other gets the first. */
export const protocolVersions: readonly string[] = ['2025-06-18', '2025-03-26', '2024-11-05'];

/** The errors of JSON-RPC the server gives. */
export const rpcErrors = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
} as const;

/** The id of a request: a string, a number, or `null` when it could not be read. */
export type RpcId = string | number | null;

/** An answer of JSON-RPC 2.0. */
export type RpcResponse =
  | { readonly jsonrpc: '2.0'; readonly id: RpcId; readonly result: Json }
  | {
      readonly jsonrpc: '2.0';
      readonly id: RpcId;
      readonly error: { readonly code: number; readonly message: string };
    };

/** What the server says of itself in `initialize`. */
export interface ServerInfo {
  /** Datardo's version. */
  readonly version: string;
  readonly instructions: string;
}

/** What to do with a message. */
export type MessageAnswer =
  /** A notification: no answer. */
  | { readonly kind: 'none' }
  /** The answer, and the line of the Log it gives, if any. */
  | { readonly kind: 'response'; readonly response: RpcResponse; readonly log?: McpLogEvent }
  /** A call of a known tool with its required arguments: carry it out, then give its end to {@link callAnswer}. */
  | { readonly kind: 'call'; readonly id: RpcId; readonly tool: ToolDefinition; readonly arguments: ToolArguments };

function failure(id: RpcId, code: number, message: string): MessageAnswer {
  return { kind: 'response', response: { jsonrpc: '2.0', id, error: { code, message } } };
}

function success(id: RpcId, result: Json): MessageAnswer {
  return { kind: 'response', response: { jsonrpc: '2.0', id, result } };
}

/** The result of a tool: its text, with `isError: true` when it failed. */
export function toolResult(text: string, isError: boolean): Json {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}

function recordOf(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function idOf(value: unknown): RpcId {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

/** A tool as `tools/list` gives it: its name, title, description, schema and annotations, all of them read-only. */
export function listedTool(tool: ToolDefinition): Json {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema as unknown as Json,
    annotations: { title: tool.title, readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  };
}

function initializeResult(params: Readonly<Record<string, unknown>> | undefined, info: ServerInfo): Json {
  const asked = params?.['protocolVersion'];
  const [first = '2025-06-18'] = protocolVersions;
  return {
    protocolVersion: typeof asked === 'string' && protocolVersions.includes(asked) ? asked : first,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: 'datardo', title: 'Datardo', version: info.version },
    instructions: info.instructions,
  };
}

/** The keys of the required arguments that are absent, `null` or `""`. */
export function missingKeys(tool: ToolDefinition, args: ToolArguments): readonly string[] {
  return (tool.inputSchema.required ?? []).filter((key) => {
    const value = args[key];
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
  });
}

/** `Missing argument: connection.`, `Missing arguments: database, collection.` */
export function missingSentence(keys: readonly string[]): string {
  return `Missing argument${keys.length === 1 ? '' : 's'}: ${keys.join(', ')}.`;
}

function toolCall(id: RpcId, params: Readonly<Record<string, unknown>> | undefined, tools: readonly ToolDefinition[]) {
  const name = params?.['name'];
  const tool = tools.find((each) => each.name === name);
  if (tool === undefined) {
    return failure(id, rpcErrors.invalidParams, `Unknown tool: ${String(name)}`);
  }
  const given = params?.['arguments'] ?? {};
  const args = recordOf(given);
  if (args === undefined) {
    return failure(id, rpcErrors.invalidParams, 'The arguments must be an object');
  }
  const missing = missingKeys(tool, args);
  if (missing.length > 0) {
    return {
      ...(success(id, toolResult(missingSentence(missing), true)) as Extract<MessageAnswer, { kind: 'response' }>),
      log: { kind: 'call', tool: tool.name, arguments: args, outcome: { kind: 'missing', keys: missing } },
    } satisfies MessageAnswer;
  }
  return { kind: 'call', id, tool, arguments: args } satisfies MessageAnswer;
}

/**
 * Feature: mcp.protocol — the answer to one message, given the tools offered now (`mcp.read-data`). A message that
 * is not an object gets -32600 with `id: null`; one without `jsonrpc: "2.0"` or a string `method` gets -32600 when it
 * has an `id`, nothing when it is a notification; a notification never gets an answer.
 */
export function answer(message: unknown, tools: readonly ToolDefinition[], info: ServerInfo): MessageAnswer {
  const record = recordOf(message);
  if (record === undefined) {
    return failure(null, rpcErrors.invalidRequest, 'Invalid request');
  }
  const notification = record['id'] === undefined;
  const id = idOf(record['id']);
  const method = record['method'];
  if (record['jsonrpc'] !== '2.0' || typeof method !== 'string') {
    return notification ? { kind: 'none' } : failure(id, rpcErrors.invalidRequest, 'Invalid request');
  }
  if (notification) {
    return { kind: 'none' };
  }
  const params = recordOf(record['params']);
  switch (method) {
    case 'initialize':
      return success(id, initializeResult(params, info));
    case 'ping':
      return success(id, {});
    case 'tools/list':
      return success(id, { tools: tools.map(listedTool) });
    case 'tools/call':
      return toolCall(id, params, tools);
    default:
      return failure(id, rpcErrors.methodNotFound, `Method not found: ${method}`);
  }
}

/** The answer to a call once the tool ended, and its line of the Log: `ok` or `error: <message>`. */
export function callAnswer(
  call: Extract<MessageAnswer, { kind: 'call' }>,
  end: ToolEnd,
): { readonly response: RpcResponse; readonly log: McpLogEvent } {
  const failed = end.kind === 'fail';
  const text = failed ? end.message : end.text;
  return {
    response: { jsonrpc: '2.0', id: call.id, result: toolResult(text, failed) },
    log: {
      kind: 'call',
      tool: call.tool.name,
      arguments: call.arguments,
      outcome: failed ? { kind: 'error', message: end.message } : { kind: 'ok' },
    },
  };
}

/** The answer to a message that is not JSON: -32700 `Parse error`, with `id: null` (HTTP 400). */
export const parseErrorResponse: RpcResponse = {
  jsonrpc: '2.0',
  id: null,
  error: { code: rpcErrors.parse, message: 'Parse error' },
};

/**
 * What the HTTP answer carries for a body: one message gets its answer, an array the array of its answers; `undefined`
 * when nothing is answered (only notifications), which is HTTP 202 with no body.
 */
export function batchBody(answers: readonly (RpcResponse | undefined)[], wasArray: boolean): Json | undefined {
  const given = answers.filter((each): each is RpcResponse => each !== undefined);
  if (given.length === 0) {
    return undefined;
  }
  return wasArray ? given : given[0];
}
