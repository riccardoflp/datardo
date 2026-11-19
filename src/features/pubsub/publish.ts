/**
 * Feature: pubsub.publish
 *
 * Sends one message to a channel, on the connection's ordinary client, for example to try what a subscriber does with
 * it. The form says what is sent; no confirmation follows, since a message deletes and overwrites nothing. It cannot
 * be undone: a message that was delivered cannot be withdrawn. Refused on a read-only connection.
 */
import type { Json } from '../../shared/engine-request';
import type { After, Answers, Context, Outcome } from '../../shared/feature';
import { ask, noDanger, refuse, run } from '../../shared/feature';
import type { Question } from '../../shared/question';
import { savedConnection } from '../../shared/state/connections';
import { sizeText } from '../console/output';
import { commandLine } from '../runner/step-text';
import { text } from './text';
import type { PubSubPage } from './types';
import { bytesOf, bytesOfHex, pageConnectionOf, pubsubPageOf, startArgs } from './types';

/** How the text of **Message** is sent. */
export type SendAs = 'text' | 'json' | 'hex';

/** What the form holds. */
export interface PublishForm {
  readonly channel: string;
  readonly message: string;
  readonly sendAs: SendAs;
}

/** This form sends a message of up to this many bytes (Datardo's choice). */
export const publishMostBytes = 1_048_576;

/** The key of `state.runner.remembered` under which the channel published to last is kept, by connection. */
export const lastChannelKey = 'pubsub.publish';

/** Why the form cannot be sent, with its code: the form shows it under its field and disables **Publish**. */
export type PublishProblem = { readonly code: string; readonly message: string };

function hexProblem(typed: string): PublishProblem | undefined {
  const digits = typed.replace(/\s+/gu, '');
  const wrong = /[^0-9a-fA-F]/u.exec(digits);
  if (wrong !== null) {
    return { code: 'pubsub.publish/invalid-hex', message: text.publish.notHex(wrong[0]) };
  }
  return digits.length % 2 === 0
    ? undefined
    : { code: 'pubsub.publish/invalid-hex', message: text.publish.oddHex(digits.length) };
}

function jsonProblem(typed: string): PublishProblem | undefined {
  try {
    JSON.parse(typed);
    return undefined;
  } catch (error: unknown) {
    const said = error instanceof Error ? error.message : String(error);
    return { code: 'pubsub.publish/invalid-json', message: text.publish.invalidJson(said) };
  }
}

/** The bytes sent: the text in UTF-8, the JSON as typed, or the bytes the pairs of hexadecimal digits name. */
export function messageBytes(form: PublishForm): Uint8Array {
  if (form.sendAs === 'hex') {
    return bytesOfHex(form.message.replace(/\s+/gu, '')) ?? new Uint8Array();
  }
  return bytesOf(form.message.replace(/\r\n?/gu, '\n'));
}

/** What keeps the form from being sent, as the user types, or undefined when it can be sent. */
export function publishProblem(form: PublishForm): PublishProblem | undefined {
  if (form.channel === '') {
    return { code: 'pubsub.publish/no-channel', message: text.publish.noChannel };
  }
  const problem =
    form.sendAs === 'hex' ? hexProblem(form.message) : form.sendAs === 'json' ? jsonProblem(form.message) : undefined;
  if (problem !== undefined) {
    return problem;
  }
  const size = messageBytes(form).length;
  return size > publishMostBytes
    ? { code: 'pubsub.publish/too-large', message: text.publish.tooLarge(sizeText(size)) }
    : undefined;
}

/** The message in pairs of hexadecimal digits, as **Publish again…** puts in the form a message that is not text. */
function spacedHex(hex: string): string {
  return (hex.match(/../gu) ?? []).join(' ');
}

/** The channel the form proposes: the entry point's, else the one published to last from this page. */
function proposedChannel(
  context: Context,
  page: PubSubPage | undefined,
  args: Readonly<Record<string, unknown>>,
): string {
  if (typeof args['channel'] === 'string') {
    return args['channel'];
  }
  const remembered = context.state.runner.remembered[lastChannelKey];
  const kept =
    page === undefined ? undefined : (remembered as Readonly<Record<string, Json>> | undefined)?.[page.connection];
  return page?.lastChannel ?? (typeof kept === 'string' ? kept : '');
}

/**
 * The form **Publish a message**. `args` may hold `channel` (the entry point's), and `message` or `messageHex` (the
 * message of **Publish again…**, which chooses **Hexadecimal** for a message that is not text).
 */
export function publishQuestion(
  context: Context,
  page: PubSubPage | undefined,
  args: Readonly<Record<string, unknown>>,
): Question {
  const hex = typeof args['messageHex'] === 'string' ? args['messageHex'] : undefined;
  const message = hex === undefined ? (typeof args['message'] === 'string' ? args['message'] : '') : spacedHex(hex);
  return {
    title: text.publish.question,
    text: text.publish.takenBack,
    button: text.publish.button,
    fields: [
      {
        kind: 'text',
        key: 'channel',
        label: text.publish.channel,
        default: proposedChannel(context, page, args),
        rules: [{ kind: 'not-empty', message: text.publish.noChannel }],
      },
      { kind: 'text', key: 'message', label: text.publish.message, default: message },
      {
        kind: 'pick-one',
        key: 'sendAs',
        label: text.publish.sendAs,
        default: hex === undefined ? 'text' : 'hex',
        choices: (['text', 'json', 'hex'] as const).map((each) => ({ value: each, label: text.publish.formats[each] })),
      },
    ],
  };
}

function formOf(answers: Answers): PublishForm {
  const sendAs = answers['sendAs'];
  return {
    channel: typeof answers['channel'] === 'string' ? answers['channel'] : '',
    message: typeof answers['message'] === 'string' ? answers['message'] : '',
    sendAs: sendAs === 'json' || sendAs === 'hex' ? sendAs : 'text',
  };
}

function rememberChannel(context: Context, connection: string, channel: string): After {
  const remembered = context.state.runner.remembered[lastChannelKey];
  const before: { readonly [key: string]: Json } =
    typeof remembered === 'object' && remembered !== null && !Array.isArray(remembered)
      ? (remembered as { readonly [key: string]: Json })
      : {};
  return { kind: 'remember', key: lastChannelKey, value: { ...before, [connection]: channel } };
}

/** Feature: pubsub.publish — asks for the channel and the message, then sends `PUBLISH`. */
export function plan(context: Context, answers: Answers): Outcome {
  const id = pageConnectionOf(context);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  if (connection?.readOnly === true) {
    return refuse('pubsub.publish/read-only', text.publish.readOnly(connection.name));
  }
  const page = id === undefined ? undefined : pubsubPageOf(context.state, id);
  if (connection === undefined || answers['channel'] === undefined) {
    return ask(publishQuestion(context, page, startArgs(answers)));
  }
  const form = formOf(answers);
  const problem = publishProblem(form);
  if (problem !== undefined) {
    return refuse(problem.code, problem.message);
  }
  const command = [bytesOf('PUBLISH'), bytesOf(form.channel), messageBytes(form)];
  return run({
    title: text.publish.title(form.channel),
    steps: [
      {
        kind: 'engine',
        connection: connection.id,
        request: { engine: 'redis', database: 0, command },
        writes: true,
        text: commandLine(command),
      },
    ],
    danger: noDanger,
    undo: { cannot: text.publish.cannotUndo },
    publishes: false,
    after: [rememberChannel(context, connection.id, form.channel)],
  });
}

/** The notification once the server answered: how many clients received the message. */
export function publishedText(channel: string, clients: number): string {
  return text.publish.published(channel, clients);
}
