import { describe, expect, it } from 'vitest';
import { claudeCommand, jsonConfiguration, plan, setupChoices, statusText } from '../../../src/features/mcp/setup';
import { mcpContext, mcpState, planOf } from './harness';

const url = 'http://127.0.0.1:37018/mcp';
const on = { 'datardo.mcp.enabled': true };
const notRunning = {
  kind: 'not-running',
  port: 37018,
  why: 'Port 37018 is used by another program.',
  taken: true,
} as const;

describe('mcp.setup', () => {
  it('turns the server on before the dialog when started from Go to with the server off', () => {
    const made = planOf(plan(mcpContext('mcp.setup', mcpState()), {}));
    expect(made.steps).toEqual([
      {
        kind: 'app',
        action: 'settings.write',
        args: { name: 'datardo.mcp.enabled', value: true },
        text: 'set datardo.mcp.enabled to true',
      },
    ]);
    expect(made.after).toEqual([{ kind: 'start', feature: 'mcp.setup', target: { kind: 'app' } }]);
  });

  it('changes nothing from the top bar until an entry is picked', () => {
    const outcome = plan(mcpContext('mcp.setup', mcpState(), 'top-bar'), {});
    expect(outcome.kind).toBe('ask');
    if (outcome.kind === 'ask') {
      expect(outcome.question.title).toBe('Datardo MCP server · Off');
      expect(outcome.question.text).toBe('Copy the configuration for your AI assistant.');
    }
  });

  it('says the status in the title', () => {
    expect(statusText(mcpState({ settings: on, server: { kind: 'running', port: 37018 } }))).toBe(`Running on ${url}`);
    expect(statusText(mcpState())).toBe('Off');
    expect(statusText(mcpState({ settings: on, server: { kind: 'starting', port: 37018 } }))).toBe('starting');
    expect(statusText(mcpState({ settings: on, server: notRunning }))).toBe(
      'Not running: Port 37018 is used by another program.',
    );
  });

  it('lists Turn the server on first with the server off, and Turn the server off last with it on', () => {
    const labels = (settings: Readonly<Record<string, boolean>>) =>
      setupChoices(mcpState({ settings })).map((choice) => choice.label);
    expect(labels({})).toEqual([
      'Turn the server on',
      'Copy the command for Claude Code',
      'Copy the JSON configuration',
      'Show the log',
      'Change the port…',
      'Generate a new access token',
    ]);
    expect(labels(on)).toEqual([
      'Copy the command for Claude Code',
      'Copy the JSON configuration',
      'Show the log',
      'Change the port…',
      'Generate a new access token',
      'Turn the server off',
    ]);
  });

  it('shows the command with … in place of the token, and never the token', () => {
    const choices = setupChoices(mcpState({ settings: on }));
    const line = (value: string) => choices.find((choice) => choice.value === value)?.description;
    expect(line('claude')).toBe(claudeCommand(url, '…'));
    expect(line('json')).toBe(
      'For the mcpServers of .mcp.json, Cursor, Windsurf and other clients that support HTTP servers',
    );
    expect(line('port')).toBe('Now 37018. The configured clients need the new address');
    expect(line('log')).toBe('The tools the AI called');
  });

  it('writes the command for Claude Code and the JSON configuration', () => {
    expect(claudeCommand(url, 'T')).toBe(
      `claude mcp add --transport http datardo ${url} --header "Authorization: Bearer T"`,
    );
    expect(jsonConfiguration(url, 'T')).toBe(
      JSON.stringify(
        { mcpServers: { datardo: { type: 'http', url, headers: { Authorization: 'Bearer T' } } } },
        null,
        2,
      ),
    );
  });

  it('copies through the main process, which reads the token, and says to keep it private', () => {
    const made = planOf(plan(mcpContext('mcp.setup', mcpState({ settings: on })), { entry: 'claude' }));
    expect(made.steps).toEqual([
      { kind: 'app', action: 'mcp.copy-configuration', args: { form: 'claude' }, text: 'copy to the clipboard' },
    ]);
    expect(made.after).toEqual([
      {
        kind: 'notify',
        level: 'info',
        text: 'Copied. It contains the access token of the MCP server: keep it private.',
      },
    ]);
  });

  it('starts the other features for their entries, and turns the server off', () => {
    const after = (entry: string) => planOf(plan(mcpContext('mcp.setup', mcpState({ settings: on })), { entry })).after;
    expect(after('log')).toEqual([{ kind: 'open', page: 'log', at: 'source:MCP' }]);
    expect(after('port')).toEqual([{ kind: 'start', feature: 'mcp.change-port', target: { kind: 'app' } }]);
    expect(after('token')).toEqual([{ kind: 'start', feature: 'mcp.access-token', target: { kind: 'app' } }]);
    const off = planOf(plan(mcpContext('mcp.setup', mcpState({ settings: on })), { entry: 'off' }));
    expect(off.steps).toEqual([
      {
        kind: 'app',
        action: 'settings.write',
        args: { name: 'datardo.mcp.enabled', value: null },
        text: 'set datardo.mcp.enabled to false',
      },
    ]);
  });
});
