/**
 * How a formatting rule is named where it is shown (`table.formatting`, `table.rows`): on its line, its name or else
 * its condition on one line or `by <field>`; in the tooltip of what it colored, *Formatting: { status: "failed" }
 * (red)*, so that the color is never the only sign.
 */
import { isFieldRule, type FormatRule } from '../../../shared/formatting-rules';
import type { DrawnColor } from '../format-table';
import { formatShares } from '../format-table';
import { text } from '../text';

/** A condition on one line: its runs of spaces and line breaks as one space. */
export function oneLineCondition(condition: string): string {
  return condition.replace(/\s+/gu, ' ').trim();
}

/** What a rule's line shows: its name, else its condition on one line, else `by <field>`. */
export function ruleSummary(rule: FormatRule): string {
  if (rule.name !== undefined) {
    return rule.name;
  }
  return isFieldRule(rule) ? text.formatting.byField(rule.field) : oneLineCondition(rule.condition);
}

/** The name of a color drawn: its preset, or `scale` for a field rule's scale (`table.format-field`). */
function colorName(rule: FormatRule, drawn: DrawnColor): string {
  const plain = drawn.percent === formatShares.row.plain || drawn.percent === formatShares.cell.plain;
  return isFieldRule(rule) && (drawn.toward !== undefined || !plain) ? text.formatting.scale : drawn.color;
}

/** The line a colored row or cell adds to its tooltip: *Formatting: { status: "failed" } (red)*. */
export function formattingLine(rule: FormatRule, drawn: DrawnColor): string {
  return text.formatting.tooltipLine(ruleSummary(rule), colorName(rule, drawn));
}
