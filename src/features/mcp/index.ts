/**
 * The MCP server's area as the runner and the main process use it: the Operations the runner starts, every tool of
 * the server with the group that answers it, and the one function that steps a call (`toolStep`). The tools are not
 * features the runner starts: the main process's server (`src/main/mcp`) calls `toolStep` round after round, sending
 * what each step asks and adding the replies to `call.rounds`, until the step is an answer or a failure.
 */
import { featureId } from '../../shared/ids';
import type { Context, RunnableFeature } from '../../shared/feature';
import type { SettingsState } from '../../shared/state/settings';
import { plan as accessToken } from './access-token';
import { plan as changePort } from './change-port';
import { group as dataModelTools } from './data-model-tools';
import { group as dataTools } from './data-tools';
import { group as debuggingTools } from './debugging-tools';
import { group as deploymentTools } from './deployment-tools';
import { group as performanceTools } from './performance-tools';
import { mcpSettings, offeredTools } from './read-data';
import { group as redisKeyTools } from './redis-key-tools';
import { group as redisServerTools } from './redis-server-tools';
import { plan as server } from './server';
import { plan as setup } from './setup';
import { group as tabTools } from './tab-tools';
import type { ToolGroupOf } from './tool/schemas';
import type { ToolCall, ToolDefinition, ToolStep } from './types';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'operation', id: featureId('mcp.server'), plan: server },
  { kind: 'operation', id: featureId('mcp.access-token'), plan: accessToken },
  { kind: 'operation', id: featureId('mcp.setup'), plan: setup },
  { kind: 'operation', id: featureId('mcp.change-port'), plan: changePort },
];

/** The groups of tools, in the order `tools/list` gives them. */
export const toolGroups: readonly ToolGroupOf[] = [
  dataTools,
  dataModelTools,
  debuggingTools,
  performanceTools,
  deploymentTools,
  redisKeyTools,
  redisServerTools,
  tabTools,
];

/** Every tool of the server. */
export const allTools: readonly ToolDefinition[] = toolGroups.flatMap((group) => group.tools);

/** The tools offered now: those that read data are left out while `datardo.mcp.readData` is off (`mcp.read-data`). */
export function toolsOffered(settings: SettingsState): readonly ToolDefinition[] {
  return offeredTools(allTools, mcpSettings(settings));
}

/** What the tool of a call needs next, given the replies of its rounds so far, or how it ended. */
export function toolStep(context: Context, call: ToolCall): ToolStep {
  const group = toolGroups.find((each) => each.tools.some((tool) => tool.name === call.tool));
  return group === undefined ? { kind: 'fail', message: `Unknown tool: ${call.tool}` } : group.step(context, call);
}
