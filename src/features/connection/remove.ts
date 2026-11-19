/**
 * Feature: connection.remove — removes a saved connection, with its secrets and everything Datardo keeps for it.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Answers, Context, Outcome, Step } from '../../shared/feature';
import { ask, noDanger, run } from '../../shared/feature';
import type { Tab } from '../../shared/state/tabs';
import { changesAnswer, closeSteps, titleOf } from '../tab/close';
import { text as tabText } from '../tab/text';
import { closedByRemoval } from '../tab/connection-gone';
import { connectionState } from '../../shared/state/connections';
import { disconnectStep, hasClient } from './disconnect';
import { deleteSecretsStep } from './secrets';
import { planText } from './text';
import { appStep, connectionsOf, nothingToDo, targetConnection } from './types';
import { operationCount } from '../undo/forget-connection';

/**
 * What belongs to the connection in the other areas. The pins are counted in the app's state (`nav.pin`). The queries
 * saved for me are counted by the read of their area (`saved-query.save`, M20), which gives `answers.counts`: until
 * that area exists nothing gives it, the count is 0, and its step (`saved-query.forget-connection`) is left out of the
 * plan. The operations of the undo history are counted in the app's state (`undo.forget-connection`).
 */
export interface RemovalCounts {
  readonly savedQueries: number;
  readonly pins: number;
  readonly undoOperations: number;
  /** Whether Datardo remembers anything else of it: its file of `state/`. */
  readonly remembers: boolean;
}

/** Nothing of the connection in the other areas. */
export const nothingElse: RemovalCounts = { savedQueries: 0, pins: 0, undoOperations: 0, remembers: false };

function countsOf(value: unknown, pins: number, undoOperations: number): RemovalCounts {
  if (typeof value !== 'object' || value === null) {
    return { ...nothingElse, pins, undoOperations };
  }
  const fields = value as Readonly<Record<string, unknown>>;
  const count = (name: string): number => (typeof fields[name] === 'number' ? fields[name] : 0);
  return {
    savedQueries: count('savedQueries'),
    pins,
    undoOperations,
    remembers: fields['remembers'] === true,
  };
}

/** The confirmation's detail: what is deleted with it, each on its line and only when there is some. */
export function removalText(counts: RemovalCounts, publishers: readonly ConnectionView[]): string {
  const lines = [
    planText.deletedWithIt,
    planText.itsSecrets,
    ...(counts.savedQueries > 0 ? [planText.savedQueries(counts.savedQueries)] : []),
    ...(counts.pins > 0 ? [planText.pins(counts.pins)] : []),
    ...(counts.undoOperations > 0 ? [planText.undoOperations(counts.undoOperations)] : []),
    ...(counts.remembers ? [planText.remembers] : []),
    planText.removeCannotUndo,
    ...(publishers.length > 0 ? [planText.noLongerPublish(publishers.map((each) => each.name).join(', '))] : []),
  ];
  return lines.join('\n');
}

function removalSteps(
  connection: ConnectionView,
  counts: RemovalCounts,
  publishers: readonly ConnectionView[],
  connected: boolean,
): readonly Step[] {
  const id = { connection: connection.id };
  const name = connection.name;
  return [
    ...(connected ? [disconnectStep(connection)] : []),
    deleteSecretsStep(connection),
    ...(counts.undoOperations > 0
      ? [appStep('undo.forget-connection', id, planText.deleteUndo(counts.undoOperations, name))]
      : []),
    ...(counts.savedQueries > 0
      ? [appStep('saved-query.forget-connection', id, planText.deleteSavedQueries(counts.savedQueries, name))]
      : []),
    ...(counts.pins > 0 ? [appStep('nav.forget-pins', id, planText.deletePins(counts.pins, name))] : []),
    ...(counts.remembers ? [appStep('connection.forget-state', id, planText.deleteRemembered(name))] : []),
    ...publishers.map((each) =>
      appStep('connection.unlink', { connection: each.id }, planText.unlink(each.name, name)),
    ),
    appStep('connection.delete', id, planText.removeConnection(name)),
  ];
}

/** The key under which the answer to the question of an unsaved tab comes back. */
function changesKey(tab: Tab): string {
  return `changes:${tab.id}`;
}

/**
 * The confirmation, asked as a question when the connection has tabs with unsaved changes (`tab.connection-gone`):
 * the question of `tab.close` for each of them is a field of it, so that the confirmation comes first, as the card
 * says, and **Cancel** keeps everything.
 */
function confirmWithTabs(
  state: Context['state'],
  connection: ConnectionView,
  detail: string,
  unsaved: readonly Tab[],
): Outcome {
  return ask({
    title: planText.removeQuestion(connection.name),
    text: detail,
    button: planText.removeButton,
    fields: unsaved.map((tab) => ({
      kind: 'pick-one',
      key: changesKey(tab),
      label: tabText.question.title(titleOf(state, tab)),
      choices: [
        { value: 'save', label: tabText.question.save },
        { value: 'discard', label: tabText.question.dontSave },
      ],
      default: 'save',
    })),
  });
}

/**
 * Feature: connection.remove — the confirmation **Remove connection "<name>"?**, with, for each tab of the connection
 * with unsaved changes, the question of `tab.close`, then the steps: disconnect, delete the secrets and what the other
 * areas keep of it, unlink the MongoDB connections that publish through it, remove it. **Cancel** on any question
 * keeps everything. `answers.counts` holds what the other areas counted, when they did.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const connection = targetConnection(context);
  if (connection === undefined) {
    return nothingToDo('Remove connection', planText.cannotUndoRemove);
  }
  const { state } = context;
  const connections = connectionsOf(state);
  const pins = (state.nav.pins[connection.id] ?? []).length;
  const counts = countsOf(answers['counts'], pins, operationCount(state, connection.id));
  const publishers = connections.saved.filter(
    (each) => each.engine === 'mongodb' && each.publishesTo === connection.id,
  );
  const connected = hasClient(connectionState(connections, connection.id));
  const detail = removalText(counts, publishers);
  const { unsaved } = closedByRemoval(state, connection.id);
  if (unsaved.some((tab) => changesAnswer(answers, changesKey(tab)) === undefined)) {
    return confirmWithTabs(state, connection, detail, unsaved);
  }
  const saves = unsaved.flatMap((each) =>
    closeSteps(state, each, changesAnswer(answers, changesKey(each))).filter((step) => step.action !== 'tab.close'),
  );
  return run({
    title: planText.removeQuestion(connection.name),
    steps: [...saves, ...removalSteps(connection, counts, publishers, connected)],
    danger: unsaved.length > 0 ? noDanger : { kind: 'confirm', text: detail, button: planText.removeButton },
    undo: { cannot: planText.cannotUndoRemove },
    publishes: false,
    after: [],
  });
}
