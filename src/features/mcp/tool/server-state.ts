/**
 * The state of the MCP server as the area's operations and views read it: the part `mcp` of the app's state
 * (`src/shared/state/mcp.ts`), and the settings that turn the server on and give its port.
 */
import type { AppState } from '../../../shared/state';
import { initialMcpState, type McpServerState, type McpState } from '../../../shared/state/mcp';
import { mcpSettings } from '../read-data';
import { serverUrl } from '../types';

/**
 * The part `mcp` of the app's state. Until the part is registered in `src/shared/state/index.ts` the state has none,
 * and the server is taken as off: once it is, this reads `state.mcp`.
 */
export function mcpStateOf(state: AppState): McpState {
  const part = (state as unknown as Readonly<Record<string, unknown>>)['mcp'];
  return typeof part === 'object' && part !== null && 'server' in part ? (part as McpState) : initialMcpState;
}

/** The server's state, `off` whenever `datardo.mcp.enabled` is off. */
export function serverStateOf(state: AppState): McpServerState {
  return mcpSettings(state.settings).enabled ? mcpStateOf(state).server : { kind: 'off' };
}

/** The address of the server on the port of the settings. */
export function urlOf(state: AppState): string {
  return serverUrl(mcpSettings(state.settings).port);
}
