/**
 * What the tests of conditional formatting share: values and documents written in mongosh syntax, and rules.
 */
import type { Json } from '../../../src/shared/engine-request';
import type { ConditionRule, FieldRule, PresetColor } from '../../../src/shared/formatting-rules';
import { parsedValue } from '../../../src/features/query/parse';
import type { Document } from '../../../src/features/table/types';

/** A value written in mongosh syntax, as `query.parse` reads it: canonical Extended JSON. */
export function value(written: string): Json {
  const parsed = parsedValue(written, 0, () => '000000000000000000000000');
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

/** Documents written in mongosh syntax. */
export function documents(...written: readonly string[]): Document[] {
  return written.map((each) => value(each) as Document);
}

/** A condition rule of the row, or of a field's cell. */
export function condition(id: string, written: string, color: PresetColor, field?: string): ConditionRule {
  return { id, condition: written, color, ...(field === undefined ? {} : { field }) };
}

/** A field rule in `auto`, with what the test gives it. */
export function byField(
  id: string,
  field: string,
  more: Partial<Omit<FieldRule, 'id' | 'kind' | 'field'>> = {},
): FieldRule {
  return { id, kind: 'field', field, target: 'cell', mode: 'auto', ...more };
}
