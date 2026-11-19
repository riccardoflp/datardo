/**
 * Feature: aggregate.build
 *
 * Turns the stages of the editor into the pipeline the server receives, up to the stage shown, or says which stage is
 * wrong. Only the enabled stages up to the stage shown are read; a stage number in a message counts every stage of the
 * editor from 1, disabled ones included. Values keep the BSON types as typed: the pipeline is canonical Extended JSON.
 */
import type { Json } from '../../shared/engine-request';
import { noMakers, type Makers } from './mongosh/helpers';
import { valueOf } from './mongosh/parse';
import { text } from './text';
import { isStageOperator } from './to-text';
import { firstStageNames, stageName, writeStageNames, type Stage } from './types';

/** The last stage of a pipeline that writes: `$out` or `$merge`, its place in the editor from 0, and its body. */
export interface WriteStage {
  readonly index: number;
  readonly name: string;
  readonly body: Json;
}

/** The pipeline to send and the stage that writes when it ends with one; or the error and its stage, from 0. */
export type BuiltPipeline =
  | { readonly ok: true; readonly pipeline: readonly Json[]; readonly writes?: WriteStage }
  | { readonly ok: false; readonly message: string; readonly stage: number };

interface Read {
  readonly index: number;
  readonly name: string;
  readonly body: Json;
}

type StageRead = { readonly ok: true; readonly read: Read } | { readonly ok: false; readonly message: string };

function readStage(stage: Stage, index: number, makers: Makers): StageRead {
  const name = stageName(stage);
  const failed = (reason: string): StageRead => ({ ok: false, message: text.errors.stage(index + 1, name, reason) });
  if (!isStageOperator(name)) {
    return failed(text.errors.notOperator(name));
  }
  if (stage.body.trim() === '') {
    return failed(text.errors.emptyBody);
  }
  const parsed = valueOf(stage.body, makers);
  return parsed.ok ? { ok: true, read: { index, name, body: parsed.value } } : failed(parsed.message);
}

function misplaced(reads: readonly Read[]): BuiltPipeline | undefined {
  const notFirst = reads.find((read, place) => place > 0 && firstStageNames.includes(read.name));
  if (notFirst !== undefined) {
    return { ok: false, message: text.errors.mustBeFirst(notFirst.name), stage: notFirst.index };
  }
  const notLast = reads.find((read, place) => place < reads.length - 1 && writeStageNames.includes(read.name));
  return notLast === undefined
    ? undefined
    : { ok: false, message: text.errors.mustBeLast(notLast.name), stage: notLast.index };
}

/**
 * Feature: aggregate.build — the pipeline of the stages up to `upTo` (the index from 0 of the stage shown, the last
 * one for the whole pipeline). `ISODate()` and `ObjectId()` in a body need the makers of a context.
 */
export function builtPipeline(stages: readonly Stage[], upTo: number, makers: Makers = noMakers): BuiltPipeline {
  const reads: Read[] = [];
  for (const [index, stage] of stages.entries()) {
    if (index > upTo || !stage.enabled) {
      continue;
    }
    const read = readStage(stage, index, makers);
    if (!read.ok) {
      return { ok: false, message: read.message, stage: index };
    }
    reads.push(read.read);
  }
  const wrong = misplaced(reads);
  if (wrong !== undefined) {
    return wrong;
  }
  const pipeline = reads.map((read): Json => ({ [read.name]: read.body }));
  const last = reads.at(-1);
  return last !== undefined && writeStageNames.includes(last.name)
    ? { ok: true, pipeline, writes: last }
    : { ok: true, pipeline };
}
