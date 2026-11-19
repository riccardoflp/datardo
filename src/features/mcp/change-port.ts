/**
 * Feature: mcp.change-port
 *
 * Moves the server to another port, for when 37018 is taken: a number asked in the dialog **Port of Datardo's MCP
 * server**, then one app step, `set datardo.mcp.port to <port>`. The port suggested is the current one, or, when it is
 * taken, the first free one the main process found from the next port, up to 50 further (`freePort` of the server's
 * state). Once the server listens on the new port, the main process shows {@link movedNotice}; when the new port
 * cannot be used either, it shows the warning of `mcp.server` instead.
 */
import { ask, noDanger, run, type After, type Answers, type Context, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { TextRule } from '../../shared/question';
import { appTarget } from '../../shared/target';
import { writeSettingAction } from '../settings/change';
import { mcpSettings } from './read-data';
import { text } from './text';
import { serverStateOf } from './tool/server-state';
import { defaultPort, highestPort, lowestPort } from './types';

/** A whole number from 1024 to 65535, spaces around allowed. */
export const portPattern =
  '^\\s*(102[4-9]|10[3-9]\\d|1[1-9]\\d\\d|[2-9]\\d{3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d\\d|655[0-2]\\d|6553[0-5])\\s*$';

/** The rule of the field. */
export const portRule: TextRule = { kind: 'pattern', pattern: portPattern, message: text.port.rule };

/** The port an entry names, when it is one from 1024 to 65535. */
export function portOf(entry: unknown): number | undefined {
  const value = typeof entry === 'number' ? entry : typeof entry === 'string' ? Number(entry.trim()) : Number.NaN;
  return Number.isInteger(value) && value >= lowestPort && value <= highestPort ? value : undefined;
}

/**
 * The ports the main process tries, in order, when the port is taken: from the next one, up to 50 ports further, never
 * past 65535. The first that can be listened on becomes `freePort` of the state.
 */
export function candidatePorts(port: number): readonly number[] {
  const last = Math.min(port + 50, highestPort);
  return Array.from({ length: Math.max(0, last - port) }, (_, index) => port + 1 + index);
}

/** The first of the candidates that is free, given which are; `undefined` when none is. */
export function firstFreePort(port: number, free: (candidate: number) => boolean): number | undefined {
  return candidatePorts(port).find(free);
}

/** The port suggested: the current one, or the free one found when it is taken. */
export function suggestedPort(context: Context): { readonly port: number; readonly now: string } {
  const port = mcpSettings(context.state.settings).port;
  const server = serverStateOf(context.state);
  if (server.kind === 'not-running' && server.taken) {
    return { port: server.freePort ?? port, now: text.port.taken(port) };
  }
  return { port, now: String(port) };
}

/** The notification once the server listens on the new port, with **Copy configuration…**. */
export function movedNotice(to: number, from: number): After {
  return {
    kind: 'notify',
    level: 'success',
    text: text.port.moved(to, from),
    actions: [
      { label: text.port.copy, element: 'mcp.setup@notification', feature: featureId('mcp.setup'), target: appTarget },
    ],
  };
}

/** Feature: mcp.change-port — ask the port, then set it; the port already set changes nothing. */
export function plan(context: Context, answers: Answers): Outcome {
  const current = mcpSettings(context.state.settings).port;
  const chosen = portOf(answers['port']);
  if (chosen === undefined) {
    const suggested = suggestedPort(context);
    return ask({
      title: text.port.title,
      text: text.port.line(suggested.now),
      button: text.port.button,
      fields: [
        { kind: 'text', key: 'port', label: text.port.label, default: String(suggested.port), rules: [portRule] },
      ],
    });
  }
  const steps =
    chosen === current
      ? []
      : [
          {
            kind: 'app' as const,
            action: writeSettingAction,
            args: { name: 'datardo.mcp.port', value: chosen === defaultPort ? null : chosen },
            text: `set datardo.mcp.port to ${String(chosen)}`,
          },
        ];
  return run({
    title: `set datardo.mcp.port to ${String(chosen)}`,
    steps,
    danger: noDanger,
    undo: { cannot: text.port.cannot },
    publishes: false,
    after: [],
  });
}
