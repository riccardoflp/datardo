/**
 * Feature: aggregate.from-text
 *
 * Reads a pipeline typed or pasted as text into stages, all enabled: an array gives one stage per item, a single
 * object one stage. Each item must be an object with exactly one field whose name starts with `$`.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue, isTypedValue } from './mongosh/format';
import { noMakers, type Makers } from './mongosh/helpers';
import { valueOf } from './mongosh/parse';
import { text } from './text';
import type { Stage } from './types';

/** The width a stage body stays on one line within (Mongoster's 36 columns). */
export const bodyWidth = 36;

/** The stages of a text, or the message that says why it is not a pipeline. */
export type StagesOfText =
  { readonly ok: true; readonly stages: readonly Stage[] } | { readonly ok: false; readonly message: string };

function stageOf(item: Json): Stage | undefined {
  if (typeof item !== 'object' || item === null || Array.isArray(item) || isTypedValue(item)) {
    return undefined;
  }
  const entries = Object.entries(item);
  const [entry] = entries;
  if (entries.length !== 1 || entry === undefined || !entry[0].startsWith('$')) {
    return undefined;
  }
  const [name, value] = entry;
  return { name, body: formattedValue(value, { kind: 'pretty', width: bodyWidth }), enabled: true };
}

/** Feature: aggregate.from-text — the stages of a text. `ISODate()` and `ObjectId()` need the makers of a context. */
export function pipelineStages(pipeline: string, makers: Makers = noMakers): StagesOfText {
  if (pipeline.trim() === '') {
    return { ok: true, stages: [] };
  }
  const parsed = valueOf(pipeline, makers);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }
  const items: readonly Json[] = Array.isArray(parsed.value) ? (parsed.value as readonly Json[]) : [parsed.value];
  const stages: Stage[] = [];
  for (const [index, item] of items.entries()) {
    const stage = stageOf(item);
    if (stage === undefined) {
      return { ok: false, message: text.errors.stageShape(index + 1) };
    }
    stages.push(stage);
  }
  return { ok: true, stages };
}
