/**
 * The actions of the MCP server's area the runner carries out for app steps: `mcp.start` `{ port }` and `mcp.stop`
 * (`mcp.server`), `mcp.new-token` (`mcp.access-token`), and `mcp.copy-configuration` `{ form }` (`mcp.setup`), which
 * puts the command for Claude Code or the JSON configuration on the clipboard with the token read here, in the main
 * process: the token never crosses the bridge, and the plan and the Log never hold it.
 */
import { clipboard } from 'electron';
import { newTokenAction } from '../../features/mcp/access-token';
import { mcpSettings } from '../../features/mcp/read-data';
import { startAction, stopAction } from '../../features/mcp/server';
import { copyAction } from '../../features/mcp/setup';
import type { Json } from '../../shared/engine-request';
import { mcpHost } from '../mcp';
import type { AreaActions } from '.';

function fieldOf(args: Json, name: string): Json | undefined {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as Readonly<Record<string, Json>>)[name]
    : undefined;
}

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  [startAction]: async (args) => {
    const port = fieldOf(args, 'port');
    await mcpHost().start(typeof port === 'number' ? port : mcpSettings(services.state.get().settings).port);
  },
  [stopAction]: () => {
    mcpHost().stop();
    return Promise.resolve();
  },
  [newTokenAction]: () => {
    mcpHost().newToken();
    return Promise.resolve();
  },
  [copyAction]: async (args) => {
    const form = fieldOf(args, 'form') === 'claude' ? 'claude' : 'json';
    const port = mcpSettings(services.state.get().settings).port;
    await clipboard.writeText(mcpHost().configuration(form, port));
  },
});
