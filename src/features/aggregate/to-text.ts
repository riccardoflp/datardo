/**
 * Feature: aggregate.to-text
 *
 * Writes the stages as one mongosh text, `[ { $match: … }, … ]`, for **Edit as text**, **Copy** and the queries list,
 * and the short form of a pipeline, `$match → $group`. Disabled stages are left out; a stage that does not parse is
 * written as it was typed, so that the text can still be read and corrected.
 */
import { formattedValue, prettyWidth } from './mongosh/format';
import { noMakers, type Makers } from './mongosh/helpers';
import { valueOf } from './mongosh/parse';
import { text } from './text';
import { stageName, type Stage } from './types';

/** Whether a name is a stage operator: `$` followed by letters only. */
export function isStageOperator(name: string): boolean {
  return /^\$[A-Za-z]+$/u.test(name.trim());
}

function stageText(stage: Stage, makers: Makers): string {
  const name = stageName(stage);
  const parsed = isStageOperator(name) && stage.body.trim() !== '' ? valueOf(stage.body, makers) : undefined;
  if (parsed?.ok !== true) {
    return `{ ${name}: ${stage.body.trim()} }`;
  }
  return formattedValue({ [name]: parsed.value }, { kind: 'pretty', width: prettyWidth, level: 1 });
}

/**
 * Feature: aggregate.to-text — the text of the enabled stages. Without makers, a stage holding `ISODate()` or
 * `ObjectId()` is written as it was typed, so that the text does not freeze the time it was written at.
 */
export function pipelineText(stages: readonly Stage[], makers: Makers = noMakers): string {
  const items = stages.filter((stage) => stage.enabled).map((stage) => `  ${stageText(stage, makers)}`);
  return items.length === 0 ? '[]' : `[\n${items.join(',\n')}\n]`;
}

/** The short form used in lists: the names of the enabled stages joined by ` → `, or *empty pipeline*. */
export function pipelineSummary(stages: readonly Stage[]): string {
  const names = stages.filter((stage) => stage.enabled).map(stageName);
  return names.length === 0 ? text.summary.empty : names.join(text.summary.separator);
}
