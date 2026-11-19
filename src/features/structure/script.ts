/**
 * Feature: structure.script
 *
 * The mongosh script that makes the right database like the left one: the steps of every difference, in an order
 * that runs, the steps that drop something commented out unless asked, and what no command can do said in comments.
 * It writes nothing to a database. Ported from Mongoster's `src/shared/structure.ts › structureScript`, `stepLines`.
 */
import { text } from './text';
import type { StructureDifference, StructureStep } from './types';
import { commandText } from './model/commands';
import { objectText, orderForScript } from './model/order';

/** What the script is written for. */
export interface ScriptOptions {
  /** The right side's database, which the script changes. */
  readonly database: string;
  /** `connection › database` of each side, for the header. */
  readonly left: string;
  readonly right: string;
  /** Whether the steps that drop something run: **Include drops in the script**. */
  readonly drops: boolean;
}

/** The lines of some steps: the note of each, then its command, behind `// ` when it drops something without drops. */
export function stepLines(steps: readonly StructureStep[], database: string, drops: boolean): readonly string[] {
  const lines: string[] = [];
  for (const step of steps) {
    if (step.note !== undefined) {
      lines.push(`// ${step.note}`);
    }
    if (step.operation === undefined) {
      continue;
    }
    const command = `${commandText(step.operation, database)};`.split('\n');
    if (step.destructive && !drops) {
      lines.push(text.script.optional, ...command.map((line) => `// ${line}`));
    } else {
      lines.push(...(step.destructive ? [text.script.destructive] : []), ...command);
    }
  }
  return lines;
}

/** The head line of a difference in the script: `// orders: index status_1 – Missing on the right: { status: 1 }`. */
export function differenceHead(difference: StructureDifference): string {
  return `// ${difference.collection}: ${objectText(difference)} – ${difference.summary}`;
}

/**
 * The steps of one difference alone, as **Copy script** of the inspector island copies them and *Steps on the right*
 * shows them: without the header, `use(…)` or the head line, ending with a new line.
 */
export function differenceScript(difference: StructureDifference, database: string, drops: boolean): string {
  return `${stepLines(difference.steps, database, drops).join('\n')}\n`;
}

/** Feature: structure.script — the script of the differences (all of them, also those the list hides). */
export function structureScript(differences: readonly StructureDifference[], options: ScriptOptions): string {
  const ordered = orderForScript(differences);
  const dropsSomething = ordered.some((difference) =>
    difference.steps.some((step) => step.destructive && step.operation !== undefined),
  );
  const lines = [
    text.script.makes(options.right, options.left),
    text.script.generated,
    ...(dropsSomething ? [options.drops ? text.script.marked : text.script.commentedOut] : []),
    '',
    `use(${JSON.stringify(options.database)});`,
  ];
  if (ordered.length === 0) {
    lines.push('', text.script.nothing);
  }
  for (const difference of ordered) {
    lines.push('', differenceHead(difference), ...stepLines(difference.steps, options.database, options.drops));
  }
  return `${lines.join('\n')}\n`;
}
