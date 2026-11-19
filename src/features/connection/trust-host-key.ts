/**
 * Feature: connection.trust-host-key — the host key of an SSH server is shown for confirmation the first time, and a
 * different key later is a warning. The main process calls it when a tunnel meets a key it does not know
 * (`HostKeyCheck`), with the server, the fingerprint and the one remembered.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { ask, noDanger, refuse, run } from '../../shared/feature';
import { appStep, argumentsOf, nothingToDo } from './types';

/** The questions of the host key of an SSH server (connection.trust-host-key). */
const hostKeyText = {
  trustTitle: (server: string): string => `Trust the SSH server ${server}?`,
  trustDetail: (fingerprint: string): string =>
    `Its host key fingerprint is\n${fingerprint}\nCompare it with the one of the server (ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub) before trusting it. It is remembered for the next connections.`,
  trust: 'Trust',
  changed: (server: string, before: string, now: string): string =>
    `The SSH host key of ${server} has changed!\nRemembered: ${before}\nNow: ${now}\nThe server may have been reinstalled, or someone may be intercepting the connection. Trust the new key only if you know why it changed.`,
  trustNew: 'Trust new key',
  remember: (server: string): string => `remember the host key of ${server}`,
  notTrusted: (server: string): string => `SSH: the host key of ${server} was not trusted`,
  cannotUndo: 'There is no command to forget a known host.',
} as const;

/** What the check knows of the key: the server, its fingerprint now, and the one remembered when there is one. */
export interface HostKeyFacts {
  readonly host: string;
  readonly port: number;
  readonly fingerprint: string;
  readonly remembered?: string;
}

/** The key of the known hosts for a server: `host:port`. */
export function serverKey(host: string, port: number): string {
  return `${host}:${String(port)}`;
}

/** The facts the check gives, from the arguments of the feature. */
export function hostKeyFacts(answers: Answers): HostKeyFacts | undefined {
  const args = argumentsOf(answers);
  const { host, port, fingerprint, remembered } = args;
  if (typeof host !== 'string' || typeof port !== 'number' || typeof fingerprint !== 'string') {
    return undefined;
  }
  return { host, port, fingerprint, ...(typeof remembered === 'string' ? { remembered } : {}) };
}

/** The answer key the check sets once the user trusted a new server in the question. */
export const trustedAnswer = 'trusted';

/**
 * Feature: connection.trust-host-key — a known key connects; an unknown one asks **Trust the SSH server…?**; a changed
 * one is a confirmation; a scheduled task or a tool of the MCP server does not ask and refuses the key.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const facts = hostKeyFacts(answers);
  if (facts === undefined) {
    return nothingToDo('Trust the SSH server', hostKeyText.cannotUndo);
  }
  const server = serverKey(facts.host, facts.port);
  if (facts.remembered === facts.fingerprint) {
    return nothingToDo(hostKeyText.trustTitle(server), hostKeyText.cannotUndo);
  }
  if (context.startedBy !== 'user') {
    return refuse('connection.trust-host-key/not-trusted', hostKeyText.notTrusted(server));
  }
  const changed = facts.remembered !== undefined;
  if (!changed && answers[trustedAnswer] !== true) {
    return ask({
      title: hostKeyText.trustTitle(server),
      text: hostKeyText.trustDetail(facts.fingerprint),
      button: hostKeyText.trust,
      fields: [],
      element: 'connection.trust-host-key@dialog',
    });
  }
  return run({
    title: hostKeyText.trustTitle(server),
    steps: [
      appStep('connection.remember-host-key', { server, fingerprint: facts.fingerprint }, hostKeyText.remember(server)),
    ],
    danger: changed
      ? {
          kind: 'confirm',
          text: hostKeyText.changed(server, facts.remembered ?? '', facts.fingerprint),
          button: hostKeyText.trustNew,
        }
      : noDanger,
    undo: { cannot: hostKeyText.cannotUndo },
    publishes: false,
    after: [],
  });
}
