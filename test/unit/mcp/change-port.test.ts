import { describe, expect, it } from 'vitest';
import {
  candidatePorts,
  firstFreePort,
  movedNotice,
  plan,
  portOf,
  portPattern,
  suggestedPort,
} from '../../../src/features/mcp/change-port';
import { mcpContext, mcpState, planOf } from './harness';

const taken = {
  kind: 'not-running',
  port: 37018,
  why: 'Port 37018 is used by another program.',
  taken: true,
  freePort: 37019,
} as const;

describe('mcp.change-port', () => {
  it('asks the port, saying when it is taken, and suggests the free port found', () => {
    const state = mcpState({ settings: { 'datardo.mcp.enabled': true }, server: taken });
    const outcome = plan(mcpContext('mcp.change-port', state), {});
    expect(outcome.kind).toBe('ask');
    if (outcome.kind === 'ask') {
      expect(outcome.question.title).toBe("Port of Datardo's MCP server");
      expect(outcome.question.text).toBe(
        'On 127.0.0.1, now 37018 (taken). The AI clients you configured need the new address afterwards.',
      );
      expect(outcome.question.fields[0]).toMatchObject({ kind: 'text', key: 'port', default: '37019' });
    }
    expect(suggestedPort(mcpContext('mcp.change-port'))).toEqual({ port: 37018, now: '37018' });
  });

  it('finds the first free port from the next one, up to 50 further', () => {
    expect(firstFreePort(37018, (port) => port !== 37018)).toBe(37019);
    expect(firstFreePort(37018, (port) => port > 37019)).toBe(37020);
    expect(candidatePorts(37018)).toHaveLength(50);
    expect(candidatePorts(37018)[49]).toBe(37068);
    expect(candidatePorts(65530)).toEqual([65531, 65532, 65533, 65534, 65535]);
    expect(firstFreePort(37018, () => false)).toBeUndefined();
  });

  it('accepts only a number from 1024 to 65535', () => {
    const rule = new RegExp(portPattern, 'u');
    for (const wrong of ['80', '70000', 'abc', '1023', '65536', '']) {
      expect(rule.test(wrong)).toBe(false);
      expect(portOf(wrong)).toBeUndefined();
    }
    for (const right of ['1024', '37019', ' 65535 ', '9999', '10000']) {
      expect(rule.test(right)).toBe(true);
      expect(portOf(right)).toBe(Number(right.trim()));
    }
  });

  it('sets the port, the default one as no setting', () => {
    const moved = planOf(plan(mcpContext('mcp.change-port'), { port: '37019' }));
    expect(moved.steps).toEqual([
      {
        kind: 'app',
        action: 'settings.write',
        args: { name: 'datardo.mcp.port', value: 37019 },
        text: 'set datardo.mcp.port to 37019',
      },
    ]);
    const state = mcpState({ settings: { 'datardo.mcp.port': 37019 } });
    const back = planOf(plan(mcpContext('mcp.change-port', state), { port: '37018' }));
    expect(back.steps).toMatchObject([{ args: { name: 'datardo.mcp.port', value: null } }]);
  });

  it('changes nothing for the port already set, and says nothing with the server off', () => {
    expect(planOf(plan(mcpContext('mcp.change-port'), { port: '37018' })).steps).toEqual([]);
    expect(planOf(plan(mcpContext('mcp.change-port'), { port: '37019' })).after).toEqual([]);
  });

  it('tells the new port once the server listens, with Copy configuration…', () => {
    expect(movedNotice(37019, 37018)).toEqual({
      kind: 'notify',
      level: 'success',
      text: "Datardo's MCP server now listens on port 37019. Give the new address to the AI clients configured with port 37018.",
      actions: [
        {
          label: 'Copy configuration…',
          element: 'mcp.setup@notification',
          feature: 'mcp.setup',
          target: { kind: 'app' },
        },
      ],
    });
  });
});
