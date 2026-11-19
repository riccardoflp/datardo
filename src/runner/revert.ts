/**
 * What the runner does around the plan of an undo (`undo.revert`, `undo.last`): the row's **Undo** reads **Undoing…**
 * while it runs, and an undo that stopped at a step says how many documents or keys failed, in the page's message line
 * when it was started from the page and in a notification otherwise (`revertReport`). The operation then stays in the
 * history, to try again; what was undone is recorded as its own operation by the usual record.
 */
import { errorMessage } from '../features/runner/error';
import { undoneOperation } from '../features/undo/plans/record-args';
import { revertReport } from '../features/undo/revert';
import { entryById } from '../features/undo/state/history';
import type { IntentResult } from '../shared/bridge';
import type { Context, Plan, Step } from '../shared/feature';
import type { OperationId } from '../shared/state/undo';
import { notify } from './notify';
import type { RunnerPorts } from './ports';

/** The operation a plan undoes, marked as being undone until {@link endUndoing}; none for any other plan. */
export function startUndoing(ports: RunnerPorts, plan: Plan): OperationId | undefined {
  const operation = undoneOperation(plan);
  if (operation !== undefined) {
    ports.state.dispatch({ slice: 'undo', type: 'undoing', operation, running: true });
  }
  return operation;
}

/** The undo has ended: its row's **Undo** is back. */
export function endUndoing(ports: RunnerPorts, operation: OperationId | undefined): void {
  if (operation !== undefined) {
    ports.state.dispatch({ slice: 'undo', type: 'undoing', operation, running: false });
  }
}

/** How many documents or keys a step of an undo puts back: the operations of a `bulkWrite`, or one key. */
function sizeOf(step: Step): number {
  if (step.kind !== 'engine') {
    return 0;
  }
  const request = step.request;
  if (request.engine === 'redis') {
    return 1;
  }
  const [operations] = request.arguments;
  return Array.isArray(operations) ? operations.length : 1;
}

/** How many failed: those of the step that failed (the operations the server refused, else all), and all after it. */
function failedCount(plan: Plan, index: number, error: unknown): number {
  const failedStep = plan.steps[index];
  const refused = (error as { readonly failedOperations?: readonly number[] }).failedOperations ?? [];
  const here = failedStep === undefined ? 0 : refused.length > 0 ? refused.length : sizeOf(failedStep);
  return here + plan.steps.slice(index + 1).reduce((sum, step) => sum + sizeOf(step), 0);
}

/**
 * The result of an undo that stopped at a step: *Undo of "<title>" incomplete: 2 documents of 5 failed: <error>*, in
 * the page's message line or a notification. None when the plan is not an undo of an operation still listed.
 */
export function revertStopped(
  ports: RunnerPorts,
  context: Context,
  run: { readonly plan: Plan; readonly operation: OperationId | undefined },
  failed: { readonly index: number; readonly error: unknown },
): IntentResult | undefined {
  const entry = run.operation === undefined ? undefined : entryById(ports.state.get().undo, run.operation);
  if (entry === undefined) {
    return undefined;
  }
  const shown = errorMessage(failed.error);
  const taken = run.plan.steps.reduce((sum, step) => sum + sizeOf(step), 0);
  const report = revertReport(entry, ports.connectionName(entry.connection), {
    taken,
    failed: failedCount(run.plan, failed.index, failed.error),
    error: shown.message,
  });
  if (context.place === 'table') {
    ports.state.dispatch({ slice: 'undo', type: 'message', message: report });
  } else {
    notify(ports, { feature: context.feature, level: 'error', text: report.text, details: shown.details });
  }
  return { kind: 'failed', message: report.text, details: shown.details };
}
