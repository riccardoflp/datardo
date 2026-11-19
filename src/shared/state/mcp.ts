/**
 * The part of the app's state that the MCP server shares with the window (mcp.md): whether it runs, on which port,
 * and why it does not, for the top bar (`mcp.status`), the setup (`mcp.setup`) and the port (`mcp.change-port`).
 * Never the access token: it stays in the secret storage of the main process.
 */

/** The state of the server. */
export type McpServerState =
  | { readonly kind: 'off' }
  | { readonly kind: 'starting'; readonly port: number }
  | { readonly kind: 'running'; readonly port: number }
  | {
      readonly kind: 'not-running';
      readonly port: number;
      /** Why it could not listen: `Port 37018 is used by another program.`, or the system's message. */
      readonly why: string;
      /** Whether another program uses the port. */
      readonly taken: boolean;
      /** The first port from the next one, up to 50 further, that nothing listens on, when the port is taken. */
      readonly freePort?: number;
    };

/** This part of the state. */
export interface McpState {
  readonly server: McpServerState;
  /** The ports whose warning was shown, once each until Datardo quits (`mcp.server`). */
  readonly warnedPorts: readonly number[];
}

/** The events of this part of the state. */
export type McpEvent =
  | { readonly slice: 'mcp'; readonly type: 'server'; readonly server: McpServerState }
  | { readonly slice: 'mcp'; readonly type: 'warned'; readonly port: number };

/** The server off, no warning shown. */
export const initialMcpState: McpState = { server: { kind: 'off' }, warnedPorts: [] };

/** The reducer of this part. */
export function reduceMcp(state: McpState, event: McpEvent): McpState {
  switch (event.type) {
    case 'server':
      return { ...state, server: event.server };
    case 'warned':
      return state.warnedPorts.includes(event.port)
        ? state
        : { ...state, warnedPorts: [...state.warnedPorts, event.port] };
  }
}
