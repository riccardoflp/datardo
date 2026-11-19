/**
 * Feature: server.kill-client
 *
 * Closes the connection of one client of the server: one step, `CLIENT KILL ID 42`, with the `id` as `CLIENT LIST`
 * gave it, after a confirmation that says who the client is and what closing it does. It cannot be undone. Built as
 * Mongoster's kill of a server operation (`src/monitor.ts › killOp`). It is not offered to an AI assistant.
 */
import type { ConnectionView } from '../../shared/connection';
import type { After, Answers, Context, EngineStep, Outcome } from '../../shared/feature';
import { refuse, run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { targetConnection } from '../../shared/target';
import { runnerText } from '../runner/text';
import { stepText } from '../runner/step-text';
import { text } from './text';
import {
  argsOf,
  connectionTarget,
  numberOfReply,
  serverCommand,
  startControl,
  textArg,
  timeText,
  type ServerControl,
} from './types';

/** What the confirmation says of the client: the fields of its row the page passes with **Disconnect…**. */
export interface ClientToKill {
  readonly id: string;
  readonly address?: string;
  readonly name?: string;
  readonly user?: string;
  readonly idleSeconds?: number;
  readonly command?: string;
  readonly flags?: string;
}

/** The client of `args.client`, when it has an id. */
export function clientOfArgs(args: unknown): ClientToKill | undefined {
  const client = argsOf(argsOf(args)['client']);
  const id = textArg(client, 'id');
  if (!/^\d+$/u.test(id)) {
    return undefined;
  }
  const texts = (['address', 'name', 'user', 'command', 'flags'] as const).flatMap((name) => {
    const value = textArg(client, name);
    return value === '' ? [] : [[name, value] as const];
  });
  const idle = client['idleSeconds'];
  return {
    id,
    ...Object.fromEntries(texts),
    ...(typeof idle === 'number' ? { idleSeconds: idle } : {}),
  };
}

/** The client in one line: *10.0.0.7:52144 · orders-api · user app · idle 3 s · last command blpop*. */
export function clientLine(client: ClientToKill): string {
  return [
    client.address,
    client.name,
    client.user === undefined ? undefined : text.kill.user(client.user),
    client.idleSeconds === undefined ? undefined : text.kill.idle(timeText(client.idleSeconds)),
    client.command === undefined ? undefined : text.kill.lastCommand(client.command),
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
}

/** The text of the confirmation, one paragraph per line, with the sentence of a replica or of the master. */
export function killText(client: ClientToKill): string {
  const flags = client.flags ?? '';
  return [
    clientLine(client),
    text.kill.closed,
    ...(flags.includes('S') ? [text.kill.replica] : []),
    ...(flags.includes('M') ? [text.kill.master] : []),
  ].join('\n');
}

/** Why **Disconnect…** of a client is disabled, or `undefined` when it is enabled. */
export function disconnectDisabled(connection: ConnectionView, client: { readonly own: boolean }): string | undefined {
  if (connection.readOnly) {
    return runnerText.readOnly(connection.name);
  }
  return client.own ? text.kill.ownConnection : undefined;
}

/** **Disconnect…** of a client, at a place of the page, with the client's row as its arguments. */
export function disconnectControl(
  connection: ConnectionView,
  client: ClientToKill & { readonly own: boolean },
  on: { readonly element: string; readonly running: boolean },
): ServerControl {
  const { own: _own, ...row } = client;
  return startControl(text.clients.disconnect, on.element, 'server.kill-client', {
    target: connectionTarget(connection.id),
    args: { client: { ...row } },
    disabledBecause: disconnectDisabled(connection, client),
    busy: on.running,
  });
}

/** What follows the step, by what the server answered: the number of clients closed. */
export function killNotification(reply: unknown, client: string): After {
  return numberOfReply(reply) === 0
    ? { kind: 'notify', level: 'info', text: text.kill.alreadyGone(client) }
    : { kind: 'notify', level: 'success', text: text.kill.disconnected(client) };
}

/**
 * Feature: server.kill-client — `args.client` is the row (`{ id, address, name, user, idleSeconds, command, flags }`)
 * and `args.own` what `CLIENT ID` answered to the page; the target is the connection. Refused on a read-only
 * connection and for the page's own client.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const id = targetConnection(context.target);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  const client = clientOfArgs(answers['args']);
  if (connection === undefined || client === undefined) {
    throw new Error('server.kill-client needs a Redis connection and a client.');
  }
  if (connection.readOnly) {
    return refuse('server.kill-client/read-only', runnerText.readOnly(connection.name));
  }
  const own = textArg(answers['args'], 'own');
  if (client.id === own) {
    return refuse('server.kill-client/own-connection', text.kill.ownConnection);
  }
  const step: Omit<EngineStep, 'text'> = {
    kind: 'engine',
    connection: connection.id,
    request: serverCommand('CLIENT', 'KILL', 'ID', client.id),
    writes: true,
  };
  return run({
    title: text.kill.title(client.id),
    steps: [{ ...step, text: stepText(step) }],
    danger: { kind: 'confirm', text: killText(client), button: text.kill.button },
    undo: { cannot: text.kill.cannotUndo },
    publishes: false,
    after: [
      {
        kind: 'start',
        feature: featureId('server.read-clients'),
        target: connectionTarget(connection.id),
        args: own === '' ? { connection: connection.id } : { connection: connection.id, own },
      },
    ],
  });
}
