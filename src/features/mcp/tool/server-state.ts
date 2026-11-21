/**
 * The state of the MCP server as the area's operations and views read it: the part `mcp` of the app's state
 * (`src/shared/state/mcp.ts`), and the settings that turn the server on and give its port.
 */
import type { AppState } from '../../../shared/state';
import { initialMcpState, type McpServerState, type McpState } from '../../../shared/state/mcp';
import { mcpSettings } from '../read-data';
import { serverUrl } from '../types';

/** The part `mcp` of the app's state; a state made before the part existed (a test's) is taken as the server off. */
export function mcpStateOf(state: AppState): McpState {
  return (state as Partial<AppState>).mcp ?? initialMcpState;
}

/** The server's state, `off` whenever `datardo.mcp.enabled` is off. */
export function serverStateOf(state: AppState): McpServerState {
  return mcpSettings(state.settings).enabled ? mcpStateOf(state).server : { kind: 'off' };
}

/** The address of the server on the port of the settings. */
export function urlOf(state: AppState): string {
  return serverUrl(mcpSettings(state.settings).port);
}
