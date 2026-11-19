/**
 * What the tests of the aggregate area start from: stages written briefly, and the stand-in parser's values.
 */
import type { Json } from '../../../src/shared/engine-request';
import { valueOf } from '../../../src/features/aggregate/mongosh/parse';
import type { Stage } from '../../../src/features/aggregate/types';

/** An enabled stage. */
export function stage(name: string, body: string, enabled = true): Stage {
  return { name, body, enabled };
}

/** A disabled stage. */
export function off(name: string, body: string): Stage {
  return stage(name, body, false);
}

/** The value of a text, which must parse. */
export function value(text: string): Json {
  const parsed = valueOf(text, { now: Date.UTC(2026, 10, 18, 9), newId: () => '65f1c0de65f1c0de65f1c0de' });
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }
  return parsed.value;
}
