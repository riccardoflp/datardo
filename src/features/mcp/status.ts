/**
 * Feature: mcp.status
 *
 * The top bar says whether the MCP server is running: **MCP** with a dot, and a tooltip that is also the name a
 * screen reader says, so that the state is never told by color alone. A click, or `Enter`, starts `mcp.setup`. The
 * tooltip never holds the access token.
 */
import type { AppState } from '../../shared/state';
import { text } from './text';
import { serverStateOf, urlOf } from './tool/server-state';

/** The dot of each state: hollow when off, green running, grey starting, orange not running. */
export type StatusDot = 'hollow' | 'green' | 'grey' | 'orange';

/** What the top bar shows. */
export interface McpStatusView {
  /** The identifier of the control (`mcp.setup@top-bar`), which starts `mcp.setup`. */
  readonly element: 'mcp.setup@top-bar';
  readonly label: string;
  readonly dot: StatusDot;
  /** The tooltip, and the accessible name. */
  readonly tooltip: string;
}

/** Feature: mcp.status — the dot and the tooltip of the server's state. */
export function view(state: AppState): McpStatusView {
  const server = serverStateOf(state);
  const shown = (dot: StatusDot, tooltip: string): McpStatusView => ({
    element: 'mcp.setup@top-bar',
    label: text.status.label,
    dot,
    tooltip,
  });
  switch (server.kind) {
    case 'off':
      return shown('hollow', text.status.off);
    case 'running':
      return shown('green', text.status.running(urlOf(state)));
    case 'starting':
      return shown('grey', text.status.starting);
    case 'not-running':
      return shown('orange', text.status.notRunning(server.why));
  }
}
