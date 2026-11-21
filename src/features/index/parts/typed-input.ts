/**
 * A text typed in an editor of the index dialogs, read as `query.parse` reads it, with its numbers written plainly as
 * the index area holds them (`relaxedValue`): what the dialogs keep for each of their inputs in mongosh syntax.
 */
import { parsedValue } from '../../query/parse';
import { relaxedValue, type TextInput } from '../types';

/** The id an `ObjectId()` typed in a definition reads as: no index option takes a new one. */
const noId = (): string => '000000000000000000000000';

/** What a text typed reads as, at the time `now` (for `ISODate()`). */
export function typedInput(text: string, now: number): TextInput {
  if (text.trim() === '') {
    return { text, parsed: { kind: 'empty' } };
  }
  const read = parsedValue(text, now, noId);
  return read.ok
    ? { text, parsed: { kind: 'value', value: relaxedValue(read.value) } }
    : { text, parsed: { kind: 'invalid', message: read.error.message } };
}
