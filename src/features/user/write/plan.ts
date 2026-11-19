/**
 * What every write of the user area is made of: one command run on the database of the user or of the role, written
 * with that database named whole (`db.getSiblingDB("shop").runCommand({ dropUser: "app" })`) and a password as `***`
 * (`runner.step-text`); a plan that is never recorded in the undo history nor published for redis-oplog, and that
 * reads the lists again; and the refusal of a read-only connection, its code written whole by the caller (R4.2).
 */
import type { Json } from '../../../shared/engine-request';
import {
  refuse,
  type After,
  type Danger,
  type EngineStep,
  type NotificationAction,
  type Outcome,
  type Plan,
} from '../../../shared/feature';
import { stepText } from '../../runner/step-text';
import { text } from '../text';
import { commandRequest, type UserPlace } from '../types';

/** The step that runs a command on the database of the place, as the confirmation and the Log write it. */
export function commandStep(place: UserPlace, body: Json): EngineStep {
  const step = {
    kind: 'engine',
    connection: place.connection,
    request: commandRequest(place.database, body),
    writes: true,
  } as const;
  return { ...step, text: stepText(step) };
}

/** The refusal of a write through a read-only connection, with the code of the card that raises it. */
export function refusedReadOnly(place: UserPlace, code: string): Outcome | undefined {
  return place.readOnly ? refuse(code, text.readOnly(place.connectionName)) : undefined;
}

/** Reads the lists of the page again. */
export function refreshAfter(place: UserPlace): After {
  return { kind: 'refresh', connection: place.connection };
}

/** The notification of a write that ran. */
export function notifySuccess(message: string, actions?: readonly NotificationAction[]): After {
  return actions === undefined || actions.length === 0
    ? { kind: 'notify', level: 'success', text: message }
    : { kind: 'notify', level: 'success', text: message, actions };
}

/** What a write of this area says besides its steps. */
export interface WritePlan {
  readonly title: string;
  readonly steps: readonly EngineStep[];
  readonly danger: Danger;
  /** Why it cannot be undone, as its card says: the confirmation says so. */
  readonly cannotUndo: string;
  readonly done: After;
}

/** The plan of a write: not recorded, not published, the lists read again after its notification. */
export function writePlan(place: UserPlace, write: WritePlan): Plan {
  return {
    title: write.title,
    steps: write.steps,
    danger: write.danger,
    undo: { cannot: write.cannotUndo },
    publishes: false,
    after: [write.done, refreshAfter(place)],
  };
}
