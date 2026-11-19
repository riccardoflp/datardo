/**
 * Feature: relation.candidates
 *
 * Picks, from the samples of a database, the fields whose values could be the `_id` or a unique field of a
 * collection, the values to look up for each, and the collections to look them up in. ObjectIds and UUIDs do not
 * repeat by chance, so every collection whose `_id`s have that type is a target; strings and numbers do, so only a
 * collection the field is named after is (`relation.name-match`). A unique field is a target when the field is named
 * like it.
 */
import { lastName, namesMatch } from './name-match';
import type { Candidate, ReferenceType, SampledField, TargetField } from './types';

/** The number of distinct sampled values looked up per candidate. */
export const valuesLookedUp = 20;

/** Of a collection that is not a view: its sampled fields and its unique fields of one field. */
export interface CandidateSample {
  readonly name: string;
  readonly fields: readonly SampledField[];
  readonly unique: readonly string[];
}

/** The type most of the sampled `_id`s of a collection have; the first such type on a tie. */
export function idType(sample: CandidateSample): ReferenceType | undefined {
  const ids = sample.fields.find((field) => field.path === '_id');
  let best: { type: ReferenceType; count: number } | undefined;
  for (const each of ids?.values ?? []) {
    if (best === undefined || each.values.length > best.count) {
      best = { type: each.type, count: each.values.length };
    }
  }
  return best?.type;
}

function isIdType(type: ReferenceType): boolean {
  return type === 'objectId' || type === 'uuid';
}

/** Whether a unique field `unique` of `collection` is named like the candidate's last name. */
function namedLikeUnique(last: string, unique: string, collection: string): boolean {
  const uniqueLast = lastName(unique).toLowerCase();
  if (last === uniqueLast) {
    return true;
  }
  return last.endsWith(uniqueLast) && namesMatch(last.slice(0, -uniqueLast.length), collection);
}

interface Pointing {
  readonly from: CandidateSample;
  readonly field: SampledField;
  readonly type: ReferenceType;
}

function targetsIn(target: CandidateSample, targetIdType: ReferenceType | undefined, at: Pointing): TargetField[] {
  const found: TargetField[] = [];
  if (targetIdType === at.type && (isIdType(at.type) || namesMatch(at.field.path, target.name))) {
    found.push({ collection: target.name, field: '_id' });
  }
  const last = lastName(at.field.path).toLowerCase();
  for (const unique of target.unique) {
    const itself = target.name === at.from.name && unique === at.field.path;
    if (!itself && namedLikeUnique(last, unique, target.name)) {
      found.push({ collection: target.name, field: unique });
    }
  }
  return found;
}

/** Feature: relation.candidates — the fields to look up, per type of their values, with their targets. */
export function candidates(samples: readonly CandidateSample[]): readonly Candidate[] {
  const idTypes = new Map(samples.map((sample) => [sample.name, idType(sample)] as const));
  const ofField = (from: CandidateSample, field: SampledField): readonly Candidate[] =>
    field.values.flatMap((typed) => {
      const values = typed.values.slice(0, valuesLookedUp);
      const at: Pointing = { from, field, type: typed.type };
      const targets = samples.flatMap((target) => targetsIn(target, idTypes.get(target.name), at));
      return values.length > 0 && targets.length > 0
        ? [{ collection: from.name, field, type: typed.type, values, targets }]
        : [];
    });
  return samples.flatMap((from) =>
    from.fields.filter((each) => each.path !== '_id').flatMap((field) => ofField(from, field)),
  );
}
