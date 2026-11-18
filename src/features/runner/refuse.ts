/**
 * Feature: runner.refuse
 *
 * When a feature will not run, the user reads why in a sentence: a notification of the kind *warning*, never a
 * dialog, whose **Details** is the refusal's code. A control whose feature would certainly refuse is disabled, with
 * the message as its tooltip.
 */
import type { RefusalCode } from '../../shared/ids';
import { runnerText } from './text';

/** A refusal, as the runner reports it. */
export interface RefusalState {
  readonly code: RefusalCode | string;
  readonly message: string;
}

/** How a refusal shows. */
export interface RefusalView {
  readonly level: 'warning';
  readonly text: string;
  /** The code, which **Details** shows and **Copy** copies. */
  readonly details: string;
}

/** Feature: runner.refuse. A refusal as a notification. */
export function view(state: RefusalState): RefusalView {
  return { level: 'warning', text: state.message, details: state.code };
}

/** What is known of where a control would write, without asking the server. */
export interface WriteTarget {
  readonly connection: string;
  readonly readOnly: boolean;
  readonly connected: boolean;
  /** The name of the MongoDB view the control would write to, when it is one. */
  readonly view?: string;
}

/** The tooltip of a control whose feature would certainly refuse, or nothing when it is enabled. */
export function disabledBecause(target: WriteTarget): string | undefined {
  if (!target.connected) {
    return runnerText.notConnected(target.connection);
  }
  if (target.readOnly) {
    return runnerText.readOnly(target.connection);
  }
  return target.view === undefined ? undefined : runnerText.isView(target.view);
}
