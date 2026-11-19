/**
 * Feature: watch.pipeline
 *
 * Turns the text of **Filter**, in mongosh syntax, into the pipeline of the change stream: no stage for an empty
 * text, one `$match` for a document, the stages themselves for a list of the stages a change stream accepts. Values
 * keep their types, as canonical Extended JSON.
 */
import type { Json } from '../../shared/engine-request';
import { isTypedValue } from '../aggregate/mongosh/format';
import { parsedValue } from '../aggregate/mongosh/parse';
import { isRecord, type JsonObject } from '../history/types';
import { pipelineText } from './text';

/** The stages a change stream accepts. */
export const streamStages: readonly string[] = [
  '$match',
  '$project',
  '$addFields',
  '$set',
  '$unset',
  '$replaceRoot',
  '$replaceWith',
  '$redact',
];

/** The pipeline, or why the text is not one. */
export type WatchPipeline =
  { readonly ok: true; readonly stages: readonly JsonObject[] } | { readonly ok: false; readonly message: string };

function isDocument(value: Json): value is JsonObject {
  return isRecord(value) && !isTypedValue(value);
}

function stagesOf(list: readonly Json[]): WatchPipeline {
  for (const stage of list) {
    if (!isDocument(stage) || Object.keys(stage).length === 0) {
      return { ok: false, message: pipelineText.notDocument };
    }
    const keys = Object.keys(stage);
    if (keys.length !== 1 || !streamStages.includes(keys[0] ?? '')) {
      return { ok: false, message: pipelineText.stage(keys.join(', ')) };
    }
  }
  return { ok: true, stages: list as readonly JsonObject[] };
}

/** Feature: watch.pipeline — the stages of the text of **Filter**, or the message of its refusal. */
export function watchPipeline(text: string): WatchPipeline {
  if (text.trim() === '') {
    return { ok: true, stages: [] };
  }
  const parsed = parsedValue(text);
  if (!parsed.ok) {
    return { ok: false, message: pipelineText.invalid(parsed.message) };
  }
  const { value } = parsed;
  if (Array.isArray(value)) {
    return stagesOf(value as readonly Json[]);
  }
  return isDocument(value)
    ? { ok: true, stages: [{ $match: value }] }
    : { ok: false, message: pipelineText.notDocument };
}
