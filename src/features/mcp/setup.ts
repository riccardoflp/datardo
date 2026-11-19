/**
 * Feature: mcp.setup
 *
 * One command turns the server on and gives the configuration for the AI client in use: a list to pick from, titled
 * `Datardo MCP server · <status>`. The two copies are app steps the main process fills with the token from the secret
 * storage ({@link claudeCommand}, {@link jsonConfiguration}): the token is never in the dialog, the plan or the window.
 */
import type { Json } from '../../shared/engine-request';
import {
  ask,
  noDanger,
  run,
  type After,
  type AppStep,
  type Answers,
  type Context,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { Choice } from '../../shared/question';
import type { AppState } from '../../shared/state';
import { appTarget } from '../../shared/target';
import { writeSettingAction } from '../settings/change';
import { logSource } from './log';
import { mcpSettings } from './read-data';
import { text } from './text';
import { serverStateOf, urlOf } from './tool/server-state';

/** The app action that copies a configuration with the token: `{ form: "claude" | "json" }`. */
export const copyAction = 'mcp.copy-configuration';

/** The name the clients know the server by. */
export const serverName = 'datardo';

/** `claude mcp add --transport http datardo http://127.0.0.1:37018/mcp --header "Authorization: Bearer <token>"`. */
export function claudeCommand(url: string, token: string): string {
  return `claude mcp add --transport http ${serverName} ${url} --header "Authorization: Bearer ${token}"`;
}

/** The `mcpServers` configuration, indented by two spaces. */
export function jsonConfiguration(url: string, token: string): string {
  const configuration = {
    mcpServers: { [serverName]: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } },
  };
  return JSON.stringify(configuration, null, 2);
}

/** The status of the title: `Running on http://127.0.0.1:37018/mcp`, `Off`, `Not running: <why>`, `starting`. */
export function statusText(state: AppState): string {
  const server = serverStateOf(state);
  switch (server.kind) {
    case 'off':
      return text.setup.off;
    case 'running':
      return text.setup.running(urlOf(state));
    case 'starting':
      return text.setup.starting;
    case 'not-running':
      return text.setup.notRunning(server.why);
  }
}

/** The entries of the list, by the server's state. */
export function setupChoices(state: AppState): readonly Choice[] {
  const settings = mcpSettings(state.settings);
  const url = urlOf(state);
  return [
    ...(settings.enabled ? [] : [{ value: 'on', label: text.setup.turnOn }]),
    { value: 'claude', label: text.setup.claude, description: claudeCommand(url, text.setup.hiddenToken) },
    { value: 'json', label: text.setup.json, description: text.setup.jsonLine },
    { value: 'log', label: text.setup.log, description: text.setup.logLine },
    { value: 'port', label: text.setup.port, description: text.setup.portLine(settings.port) },
    { value: 'token', label: text.setup.token, description: text.setup.tokenLine },
    ...(settings.enabled ? [{ value: 'off', label: text.setup.turnOff }] : []),
  ];
}

function enabledStep(on: boolean): AppStep {
  return {
    kind: 'app',
    action: writeSettingAction,
    args: { name: 'datardo.mcp.enabled', value: on ? true : null },
    text: `set datardo.mcp.enabled to ${String(on)}`,
  };
}

function setupPlan(title: string, steps: readonly AppStep[], after: readonly After[]): Outcome {
  return run({ title, steps, danger: noDanger, undo: { cannot: text.setup.nothingToUndo }, publishes: false, after });
}

function start(feature: string, args?: Json): After {
  return { kind: 'start', feature: featureId(feature), target: appTarget, ...(args === undefined ? {} : { args }) };
}

function picked(entry: string): Outcome {
  switch (entry) {
    case 'on':
      return setupPlan(enabledStep(true).text, [enabledStep(true)], []);
    case 'off':
      return setupPlan(enabledStep(false).text, [enabledStep(false)], []);
    case 'claude':
    case 'json':
      return setupPlan(
        text.setup.copyStep,
        [{ kind: 'app', action: copyAction, args: { form: entry }, text: text.setup.copyStep }],
        [{ kind: 'notify', level: 'info', text: text.setup.copied }],
      );
    case 'log':
      return setupPlan(text.setup.log, [], [{ kind: 'open', page: 'log', at: `source:${logSource}` }]);
    case 'port':
      return setupPlan(text.setup.port, [], [start('mcp.change-port')]);
    default:
      return setupPlan(text.setup.token, [], [start('mcp.access-token')]);
  }
}

/**
 * Feature: mcp.setup — from Go to with the server off, the server is turned on first and the dialog opens after; from
 * the top bar, the dialog opens and nothing changes until an entry is picked.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const entry = answers['entry'];
  if (typeof entry === 'string') {
    return picked(entry);
  }
  const enabled = mcpSettings(context.state.settings).enabled;
  if (!enabled && context.place !== 'top-bar' && context.startedBy === 'user') {
    return setupPlan(enabledStep(true).text, [enabledStep(true)], [start('mcp.setup')]);
  }
  return ask({
    title: text.setup.title(statusText(context.state)),
    text: text.setup.line,
    button: text.setup.button,
    fields: [{ kind: 'pick-one', key: 'entry', label: text.setup.line, choices: setupChoices(context.state) }],
  });
}
