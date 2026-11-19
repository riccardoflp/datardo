/**
 * The text of a dialog read as mongosh syntax (`query.parse`): the custom data of a user, the privileges of a role.
 * It is read, never evaluated (R9.1); `ObjectId()` without an argument is the id of the current time.
 */
import type { Json } from '../../../shared/engine-request';
import { isTypedValue } from '../../aggregate/mongosh/format';
import { idOfTime, parsedValue, type Parsed } from '../../query/parse';
import { isRecord } from '../types';

/** The value of a text, read at `now`. */
export function valueOfText(source: string, now: number): Parsed {
  return parsedValue(source, now, () => idOfTime(now));
}

/** Whether a value is a document: an object that is not the wrapper of a BSON type. */
export function isDocument(value: Json): boolean {
  return isRecord(value) && !isTypedValue(value);
}
