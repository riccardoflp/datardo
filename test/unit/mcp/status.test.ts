import { describe, expect, it } from 'vitest';
import { view } from '../../../src/features/mcp/status';
import { mcpState } from './harness';

const on = { 'datardo.mcp.enabled': true };

describe('mcp.status', () => {
  it('shows each state with its dot and its tooltip, which is also its name', () => {
    expect(view(mcpState())).toEqual({
      element: 'mcp.setup@top-bar',
      label: 'MCP',
      dot: 'hollow',
      tooltip: 'MCP server: off. Click to set it up.',
    });
    expect(view(mcpState({ settings: on, server: { kind: 'running', port: 37018 } }))).toMatchObject({
      dot: 'green',
      tooltip: 'MCP server: running on http://127.0.0.1:37018/mcp',
    });
    expect(view(mcpState({ settings: on, server: { kind: 'starting', port: 37018 } }))).toMatchObject({
      dot: 'grey',
      tooltip: 'MCP server: starting',
    });
    const notRunning = {
      kind: 'not-running',
      port: 37018,
      why: 'Port 37018 is used by another program.',
      taken: true,
    } as const;
    expect(view(mcpState({ settings: on, server: notRunning }))).toMatchObject({
      dot: 'orange',
      tooltip: 'MCP server: not running. Port 37018 is used by another program.',
    });
  });

  it('shows off while the setting is off, whatever the main process last said', () => {
    expect(view(mcpState({ server: { kind: 'running', port: 37018 } })).dot).toBe('hollow');
  });

  it('opens the setup, and never holds a token', () => {
    const shown = view(mcpState({ settings: on, server: { kind: 'running', port: 37018 } }));
    expect(shown.element).toBe('mcp.setup@top-bar');
    expect(JSON.stringify(shown)).not.toMatch(/Bearer|token/iu);
  });
});
