/**
 * What `structure.apply` says before it runs: which steps of the chosen differences run, how many of each command,
 * which collections lose their documents, and the lines of its confirmation. Ported from Mongoster's
 * `src/structurePanel.ts › apply`, `describe` and `src/shared/structure.ts › planSummary`.
 */
import type { EngineStep } from '../../../shared/feature';
import { text } from '../text';
import type { StructureDifference, StructureOperation, StructureStep } from '../types';
import { commandRequest, commandText } from './commands';
import { differenceName, orderForScript } from './order';

/** How the steps of the chosen differences divide: those that drop nothing, those that drop something, notes. */
export interface StepCounts {
  readonly changes: number;
  readonly drops: number;
  /** The differences whose steps are only notes: no command can apply them. */
  readonly leftOut: number;
}

/** The counts of the steps of some differences. */
export function stepCounts(differences: readonly StructureDifference[]): StepCounts {
  const steps = differences.flatMap((difference) => difference.steps);
  return {
    changes: steps.filter((step) => step.operation !== undefined && !step.destructive).length,
    drops: steps.filter((step) => step.operation !== undefined && step.destructive).length,
    leftOut: differences.filter((difference) => difference.steps.every((step) => step.operation === undefined)).length,
  };
}

/** `createIndex ×2, collMod`: the commands of the steps that drop something or not, in the order of the script. */
export function commandsText(differences: readonly StructureDifference[], destructive: boolean): string {
  const counts = new Map<string, number>();
  for (const step of orderForScript(differences).flatMap((difference) => difference.steps)) {
    if (step.operation !== undefined && step.destructive === destructive) {
      counts.set(step.operation.type, (counts.get(step.operation.type) ?? 0) + 1);
    }
  }
  return [...counts].map(([command, count]) => (count === 1 ? command : `${command} ×${String(count)}`)).join(', ');
}

/** A step of a difference that runs: its operation, and the difference it belongs to. */
export interface RunningStep {
  readonly difference: StructureDifference;
  readonly operation: StructureOperation;
}

function runs(step: StructureStep, drops: boolean): step is StructureStep & { operation: StructureOperation } {
  return step.operation !== undefined && (drops || !step.destructive);
}

/** The steps that run, in the order of the script, without those that drop something when drops are left out. */
export function runningSteps(differences: readonly StructureDifference[], drops: boolean): readonly RunningStep[] {
  return orderForScript(differences).flatMap((difference) =>
    difference.steps.filter((step) => runs(step, drops)).map((step) => ({ difference, operation: step.operation })),
  );
}

/** The collections a running step drops with their documents, in order, once each. */
export function droppedCollections(steps: readonly RunningStep[]): readonly string[] {
  const names = steps.flatMap(({ operation }) =>
    operation.type === 'drop' && operation.dropsDocuments ? [operation.collection] : [],
  );
  return [...new Set(names)];
}

/** The engine step of a running step on the right database: sent as a command, shown as the script writes it. */
export function engineStep(step: RunningStep, connection: EngineStep['connection'], database: string): EngineStep {
  return {
    kind: 'engine',
    connection,
    request: commandRequest(step.operation, database),
    writes: true,
    text: commandText(step.operation, database),
    // A step that fails stops the remaining steps of its difference only, because they need it (D31).
    group: differenceName(step.difference),
  };
}

/** The lines under the question of the confirmation. */
export function confirmationLines(
  differences: readonly StructureDifference[],
  drops: boolean,
  lost: readonly string[],
): readonly string[] {
  const counts = stepCounts(differences);
  return [
    ...(counts.changes > 0 ? [text.apply.changes(counts.changes, commandsText(differences, false))] : []),
    ...(drops && counts.drops > 0 ? [text.apply.drops(counts.drops, commandsText(differences, true))] : []),
    ...(counts.leftOut > 0 ? [text.apply.leftOut(counts.leftOut)] : []),
    ...lost,
    text.apply.always,
  ];
}
