/**
 * Feature: monitor.set-collection-balancing
 *
 * Tells the balancer to leave the chunks of one sharded collection where they are, or to move them again:
 * `db.adminCommand({ configureCollectionBalancing: "shop.orders", enableBalancing: false })`, after a confirmation;
 * on a server that answers it with the code 40415 (an unknown field) or 59 (an unknown command), instead
 * `db.getSiblingDB("config").collections.updateOne({ _id: "shop.orders" }, { $set: { noBalance: true } })`. Started
 * with `{ connection, namespace, balancing }`, `balancing` being `disable` or `enable`. Ported from Mongoster's
 * `src/monitor.ts › setCollectionBalancing`; `src/sharding.ts › setCollectionBalancing`.
 */
import type { After } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { isRecord, numberOf } from './parts/ejson';
import { adminCommand, collectionCall, mongoStep, writeTimeLimitMs } from './parts/requests';
import { text } from './text';
import { requiredConnection, startArgs, textArg, type MonitorConnection } from './types';

/** The codes of a server that does not know `enableBalancing`: an unknown field, an unknown command. */
export const olderServerCodes: readonly number[] = [40415, 59];

/** What follows the step, from its reply: the notification and the read, or the refusal when nothing matched. */
export type BalancingOutcome =
  { readonly kind: 'after'; readonly after: readonly After[] } | Extract<Outcome, { readonly kind: 'refuse' }>;

const words = text.sharding.setCollectionBalancing;

function asked(
  context: Context,
  answers: Answers,
): {
  readonly connection: MonitorConnection;
  readonly namespace: string;
  readonly enable: boolean;
} {
  const args = startArgs(answers);
  const namespace = textArg(args, 'namespace');
  if (namespace === undefined) {
    throw new Error(`${context.feature} is started on a sharded collection.`);
  }
  return {
    connection: requiredConnection(context, args),
    namespace,
    enable: textArg(args, 'balancing') === 'enable',
  };
}

/** Feature: monitor.set-collection-balancing — refused on a read-only connection and not through a mongos. */
export function plan(context: Context, answers: Answers): Outcome {
  const { connection, namespace, enable } = asked(context, answers);
  if (connection.readOnly) {
    return refuse('monitor.set-collection-balancing/read-only', text.readOnly(connection.name));
  }
  if (!connection.mongos) {
    return refuse('monitor.set-collection-balancing/unsupported', words.unsupported);
  }
  const command = { configureCollectionBalancing: namespace, enableBalancing: enable };
  const fallback = mongoStep(
    connection.id,
    collectionCall({
      database: 'config',
      collection: 'collections',
      method: 'updateOne',
      arguments: [{ _id: namespace }, { $set: { noBalance: !enable } }],
      timeLimitMs: writeTimeLimitMs,
    }),
    true,
  );
  const first = mongoStep(connection.id, adminCommand(command, writeTimeLimitMs), true);
  const question = enable ? words.enableQuestion(namespace) : words.disableQuestion(namespace);
  const warning = enable ? words.enableWarning : words.disableWarning;
  return run({
    title: enable ? words.enableTitle(namespace) : words.disableTitle(namespace),
    steps: [{ ...first, onFailure: { kind: 'instead', steps: [fallback], codes: olderServerCodes } }],
    danger: {
      kind: 'confirm',
      text: `${question}\n${warning}\n${words.whichWay(first.text, fallback.text)}`,
      button: enable ? words.enableButton : words.disableButton,
    },
    undo: { cannot: words.cannotUndo },
    publishes: false,
    after: afterOf(connection, namespace, enable, words.byCommand),
  });
}

function afterOf(connection: MonitorConnection, namespace: string, enable: boolean, way: string): readonly After[] {
  return [
    {
      kind: 'notify',
      level: 'success',
      text: enable ? words.enabled(namespace, way) : words.disabled(namespace, way),
    },
    {
      kind: 'start',
      feature: featureId('monitor.read-sharding'),
      target: { kind: 'connection', connection: connection.id },
      args: { connection: connection.id, step: 'cluster', full: true },
    },
  ];
}

/**
 * What follows, from the reply of the step that ran: the reply of `updateOne` (it has `matchedCount`) says the other
 * way was taken, and refuses when it matched no document; any other reply is that of `configureCollectionBalancing`.
 */
export function afterReplies(context: Context, answers: Answers, replies: readonly unknown[]): BalancingOutcome {
  const { connection, namespace, enable } = asked(context, answers);
  const reply = replies[replies.length - 1];
  const matched = isRecord(reply) ? numberOf(reply['matchedCount']) : undefined;
  if (matched === 0) {
    return refuse('monitor.set-collection-balancing/not-sharded', words.notSharded(namespace)) as Extract<
      Outcome,
      { readonly kind: 'refuse' }
    >;
  }
  const way = matched === undefined ? words.byCommand : words.byDocument;
  return { kind: 'after', after: afterOf(connection, namespace, enable, way) };
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = {
  kind: 'operation',
  id: featureId('monitor.set-collection-balancing'),
  plan,
};
