/**
 * Feature: connection.link-redis — chooses the saved Redis connection that receives the writes of a MongoDB connection
 * for redis-oplog. Which databases and collections publish, and how, is `oplog.publish`.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Answers, Context, Outcome } from '../../shared/feature';
import { ask, noDanger, run } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { openForm } from './add';
import { byFolder } from './edit';
import { formViewText, organizeText, planText } from './text';
import { appStep, argumentsOf, connectionById, connectionsOf, nothingToDo, targetOrCurrent } from './types';

/** The value of **Add Redis connection…** in the list. */
const addChoice = 'add';

function question(connection: ConnectionView, redis: readonly ConnectionView[]): Outcome {
  return ask({
    title: organizeText.linkTitle(connection.name),
    button: organizeText.linkButton,
    fields: [
      {
        kind: 'pick-one',
        key: 'redis',
        label: organizeText.linkTitle(connection.name),
        ...(connection.publishesTo === undefined ? {} : { default: connection.publishesTo }),
        choices: [
          ...byFolder(redis).map((each) => ({
            value: each.id,
            label: each.name,
            ...(each.id === connection.publishesTo
              ? { description: organizeText.current }
              : each.folder === undefined
                ? {}
                : { description: each.folder }),
          })),
          { value: addChoice, label: formViewText.addRedisConnection },
        ],
      },
    ],
  });
}

/** Feature: connection.link-redis — asks the Redis connection, then `link <name> to <Redis connection>`. */
export function plan(context: Context, answers: Answers): Outcome {
  const connection = targetOrCurrent(context);
  if (connection?.engine !== 'mongodb') {
    return nothingToDo('Link a Redis connection', organizeText.cannotUndoLink);
  }
  const redis = connectionsOf(context.state).saved.filter((each) => each.engine === 'redis');
  const picked = answers['redis'] ?? argumentsOf(answers)['to'];
  if (picked === undefined) {
    return question(connection, redis);
  }
  const title = organizeText.linkTitle(connection.name);
  if (picked === addChoice) {
    return run({
      title: planText.addTitle,
      steps: [],
      danger: noDanger,
      undo: { cannot: organizeText.cannotUndoLink },
      publishes: false,
      after: [openForm('redis', undefined)],
    });
  }
  const to = typeof picked === 'string' ? connectionById(context, connectionId(picked)) : undefined;
  if (to?.engine !== 'redis' || to.id === connection.publishesTo) {
    return nothingToDo(title, organizeText.cannotUndoLink);
  }
  return run({
    title,
    steps: [
      appStep('connection.link', { connection: connection.id, to: to.id }, organizeText.link(connection.name, to.name)),
    ],
    danger: noDanger,
    undo: { cannot: organizeText.cannotUndoLink },
    publishes: false,
    after: [],
  });
}
