/**
 * Feature: mcp.access-token
 *
 * The AI clients authenticate with a bearer token that Datardo creates and keeps in the secret storage; a new one
 * replaces it when the old one may have leaked. The plan is one app step, `store a new access token of the MCP
 * server`: the main process draws 32 random bytes, writes them as base64url ({@link tokenText}) in the secret storage,
 * and from then on the old token gets 401; it writes `New access token: the old one no longer works` under the source
 * **MCP** of the Log (`mcp.log`). The token never goes to the settings, the Log, the window process or a tool's answer.
 */
import { noDanger, run, type Answers, type Context, type Outcome } from '../../shared/feature';
import { text } from './text';

/** The app action that stores a new token: 32 random bytes drawn by the main process. */
export const newTokenAction = 'mcp.new-token';

/** How many random bytes a token has. */
export const tokenBytes = 32;

/** Feature: mcp.access-token — store a new token; the notification and the Log line say so. */
export function plan(_context: Context, _answers: Answers): Outcome {
  return run({
    title: text.token.title,
    steps: [{ kind: 'app', action: newTokenAction, args: { bytes: tokenBytes }, text: text.token.title }],
    danger: noDanger,
    undo: { cannot: text.token.cannot },
    publishes: false,
    after: [{ kind: 'notify', level: 'info', text: text.token.notification }],
  });
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Bytes in base64url without padding: 32 bytes give 43 characters. */
export function tokenText(bytes: Uint8Array): string {
  let out = '';
  for (let at = 0; at < bytes.length; at += 3) {
    const chunk = ((bytes[at] ?? 0) << 16) | ((bytes[at + 1] ?? 0) << 8) | (bytes[at + 2] ?? 0);
    const characters = Math.min(4, Math.ceil(((bytes.length - at) * 8) / 6));
    for (let index = 0; index < characters; index += 1) {
      out += alphabet[(chunk >> (18 - index * 6)) & 63] ?? '';
    }
  }
  return out;
}

/** Whether a token given is the token, compared in a time that does not depend on where they differ. */
export function sameToken(given: string, token: string): boolean {
  const length = Math.max(given.length, token.length);
  let difference = given.length ^ token.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (given.charCodeAt(index) || 0) ^ (token.charCodeAt(index) || 0);
  }
  return difference === 0 && token.length > 0;
}
