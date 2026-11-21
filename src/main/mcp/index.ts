/**
 * The MCP server's area in the main process: the one {@link McpHost}, made at start with the engines, the secret
 * storage and the app's state, and started or stopped by `mcp.server` each time `datardo.mcp.enabled` or
 * `datardo.mcp.port` changes, and once at start. It also answers the app actions the tools ask (`mcp.connect`,
 * `mcp.undo-history`, `mcp.undo-write`, `mcp.open-tab`, `saved-query.list`), none of which writes to a deployment.
 */
import { app } from 'electron';
import { randomBytes } from 'node:crypto';
import { mcpSettings } from '../../features/mcp/read-data';
import { undoHistoryReply, undoWriteReply } from '../../features/mcp/tool/undo-replies';
import { isToolTab } from '../../features/mcp/tool/read-only';
import { mcpActions } from '../../features/mcp/types';
import type { Intent } from '../../shared/bridge';
import type { Json } from '../../shared/engine-request';
import { connectionId, featureId } from '../../shared/ids';
import { appTarget } from '../../shared/target';
import { start as startFeature } from '../../runner/start';
import { readOperationFile } from '../../storage/undo';
import { actions as savedQueryActions } from '../actions/saved-query';
import { whenRunnerReady } from '../bridge';
import { appSecret, connectionEngines, isConnected, keepAppSecret } from '../connections';
import type { MainServices } from '../services';
import { windowHost } from '../window-host';
import { McpHost } from './host';

let host: McpHost | undefined;

/** The MCP server, once the area has started. */
export function mcpHost(): McpHost {
  if (host === undefined) {
    throw new Error("Datardo's MCP server is not ready yet.");
  }
  return host;
}

type Fields = Readonly<Record<string, Json>>;

function fieldsOf(args: Json): Fields {
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Fields) : {};
}

/** `mcp.connect` `{ connection }`: connects as opening it would, started by the MCP server, so that nothing asks. */
async function connect(args: Json): Promise<string> {
  const given = fieldsOf(args)['connection'];
  const id = connectionId(typeof given === 'string' ? given : '');
  const ports = await whenRunnerReady();
  await startFeature(
    ports,
    { feature: featureId('connection.connect'), target: { kind: 'connection', connection: id } },
    {
      startedBy: 'mcp',
    },
  );
  return isConnected(id) ? 'connected' : 'needs-the-user';
}

/** `mcp.open-tab` `{ intent }`: opens the tab, never a console or a playground; says whether the window is hidden. */
async function openTab(args: Json): Promise<Json> {
  const intent = fieldsOf(args)['intent'];
  if (!isToolTab(intent)) {
    throw new Error('The MCP server opens no such tab.');
  }
  const ports = await whenRunnerReady();
  const result = await startFeature(ports, intent as unknown as Intent, { startedBy: 'mcp' });
  if (result.kind === 'refused' || result.kind === 'failed') {
    throw new Error(result.message);
  }
  return { hidden: !windowHost.isShown() };
}

/** The app actions a tool may ask, by name. */
function toolActions(
  services: MainServices,
): Readonly<Record<string, (args: Json, signal: AbortSignal) => Promise<unknown>>> {
  const savedQueries = savedQueryActions(services);
  return {
    [mcpActions.connect]: connect,
    [mcpActions.undoHistory]: (args) => {
      const state = services.state.get();
      const limit = fieldsOf(args)['limit'];
      return Promise.resolve(
        undoHistoryReply(state.undo.entries, state.connections.saved, typeof limit === 'number' ? limit : undefined),
      );
    },
    [mcpActions.undoWrite]: async (args) => {
      const { id, limit } = fieldsOf(args);
      const file = await readOperationFile(services.dataFolder, typeof id === 'string' ? id : '');
      if (file.kind !== 'read') {
        throw new Error(`its file is ${file.kind}`);
      }
      return undoWriteReply(file.content, typeof limit === 'number' ? limit : 20);
    },
    [mcpActions.openTab]: openTab,
    'saved-query.list': (args, signal) => {
      const list = savedQueries['saved-query.list'];
      return list === undefined ? Promise.reject(new Error('No saved-query.list.')) : list(args, signal);
    },
  };
}

/** The settings that start or stop the server again at once. */
const followed: ReadonlySet<string> = new Set(['datardo.mcp.enabled', 'datardo.mcp.port']);

/** Starts `mcp.server`, which listens or stops as the settings say. */
async function follow(services: MainServices): Promise<void> {
  await whenRunnerReady();
  await services.start({ feature: featureId('mcp.server'), target: appTarget });
}

/** Makes the server, starts it when the setting is on, and starts or stops it again when the settings change. */
export async function start(services: MainServices): Promise<void> {
  const actions = toolActions(services);
  host = new McpHost({
    state: services.state,
    secrets: { get: appSecret, set: keepAppSecret },
    randomBytes: (count) => new Uint8Array(randomBytes(count)),
    calls: {
      engines: connectionEngines(),
      appAction: (action, args, signal) => {
        const answer = actions[action];
        return answer === undefined ? Promise.reject(new Error(`No action ${action}.`)) : answer(args, signal);
      },
      version: app.getVersion(),
      platform: services.platform,
      now: () => Date.now(),
    },
  });
  services.state.listen((event) => {
    if (event.slice === 'settings' && event.type === 'changed' && followed.has(event.name)) {
      void follow(services);
    }
  });
  services.onQuit(() => {
    host?.stop();
    return Promise.resolve();
  });
  if (mcpSettings(services.state.get().settings).enabled) {
    void follow(services);
  }
  await Promise.resolve();
}
