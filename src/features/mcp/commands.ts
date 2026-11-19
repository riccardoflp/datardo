/**
 * The commands of the MCP server's area, each on the Commands line of its card (R2.3).
 */
import { command, type Command } from '../command';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('mcp.setup', 'Set up the MCP server for AI assistants…'),
  command('mcp.access-token', 'Generate a new MCP access token'),
  command('mcp.change-port', 'Change MCP server port…'),
];
