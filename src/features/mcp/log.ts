/**
 * Feature: mcp.log
 *
 * What the MCP server writes in the Log, under the source **MCP**, for the user to check: one line for each call of a
 * known tool, with its arguments and its outcome, and one line each time the server's state changes. Nothing is
 * written for `initialize`, `tools/list`, `ping`, a call of an unknown or hidden tool, or a request the HTTP checks
 * refused; the access token is never written.
 */
import type { ToolArguments } from './types';

/** The source of the Log the lines are under. */
export const logSource = 'MCP';

/** Characters of the arguments of a call before they are cut with `…`. */
export const longestArguments = 300;

/** How a call of a known tool ended. */
export type CallOutcome =
  | { readonly kind: 'ok' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'missing'; readonly keys: readonly string[] };

/** What the Log is told. */
export type McpLogEvent =
  | {
      readonly kind: 'call';
      readonly tool: string;
      readonly arguments: ToolArguments;
      readonly outcome: CallOutcome;
    }
  | { readonly kind: 'listening'; readonly url: string }
  | { readonly kind: 'stopped' }
  | { readonly kind: 'not-started'; readonly why: string }
  | { readonly kind: 'new-token' };

/** The arguments of a call as JSON on one line, cut at 300 characters with `…`. */
export function argumentsText(args: ToolArguments): string {
  const text = JSON.stringify(args);
  return text.length > longestArguments ? `${text.slice(0, longestArguments)}…` : text;
}

function outcomeText(outcome: CallOutcome): string {
  switch (outcome.kind) {
    case 'ok':
      return 'ok';
    case 'error':
      return `error: ${outcome.message}`;
    case 'missing':
      return `missing ${outcome.keys.join(', ')}`;
  }
}

/**
 * Feature: mcp.log — the line of an event: `find_documents {"connection":"Local",…} → ok`, `list_databases {} →
 * missing connection`, `Listening on http://127.0.0.1:37018/mcp`, `Stopped`, `Not started: <why>`, `New access
 * token: the old one no longer works`.
 */
export function logLine(event: McpLogEvent): string {
  switch (event.kind) {
    case 'call':
      return `${event.tool} ${argumentsText(event.arguments)} → ${outcomeText(event.outcome)}`;
    case 'listening':
      return `Listening on ${event.url}`;
    case 'stopped':
      return 'Stopped';
    case 'not-started':
      return `Not started: ${event.why}`;
    case 'new-token':
      return 'New access token: the old one no longer works';
  }
}

/**
 * The line of a change of the server's state, or `undefined` when it is the line written last: the server that tries
 * the port again every 3 seconds writes `Not started: …` once.
 */
export function stateLine(event: McpLogEvent, lastStateLine: string | undefined): string | undefined {
  const line = logLine(event);
  return event.kind !== 'call' && event.kind !== 'new-token' && line === lastStateLine ? undefined : line;
}
