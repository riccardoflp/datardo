/**
 * What watches the steps of a plan while they run: how each ended, for the `_id`s of the inserts that failed, which
 * the undo history does not keep (`undo.kept`), and the writes to publish for redis-oplog (`oplog.publish`).
 */
import { failedInsertIds, generatedInsertIds, type InsertOutcome } from '../features/undo/plans/record-args';
import type { Json } from '../shared/engine-request';
import type { Plan, Step } from '../shared/feature';
import type { Publishing } from './publish';
import type { StepEnded, StepObserver } from './steps';

function insertOutcome(ended: StepEnded | undefined): InsertOutcome {
  if (ended === undefined) {
    return { kind: 'not-run' };
  }
  if (ended.kind === 'done') {
    return { kind: 'done' };
  }
  const refused = (ended.error as { readonly failedOperations?: readonly number[] } | null)?.failedOperations;
  return { kind: 'failed', failedOperations: refused ?? [] };
}

/** The observer of a plan's steps. */
export class PlanWatch implements StepObserver {
  private readonly ended = new Map<number, StepEnded>();

  /** Watches for the undo history, and for redis-oplog when the plan publishes. */
  constructor(private readonly publishing: Publishing | undefined) {}

  /** Before a step: the reads of redis-oplog. */
  readonly before = async (step: Step, index: number): Promise<void> => {
    await this.publishing?.beforeStep(step, index);
  };

  /** After a step: how it ended, and what it did for redis-oplog. */
  readonly after = async (step: Step, index: number, ended: StepEnded): Promise<void> => {
    this.ended.set(index, ended);
    await this.publishing?.afterStep(step, index, ended);
  };

  /** The `_id`s of the documents the plan's inserts did not insert: failed, or never sent. */
  failedIds(plan: Plan): readonly Json[] {
    return plan.steps.flatMap((step, index) => failedInsertIds(step, insertOutcome(this.ended.get(index))));
  }

  /** The `_id`s the plan's inserts gave to the documents that had none, from their replies. */
  insertedIds(plan: Plan): readonly Json[] {
    return plan.steps.flatMap((step, index) => {
      const ended = this.ended.get(index);
      return ended?.kind === 'done' ? generatedInsertIds(step, ended.reply) : [];
    });
  }
}
