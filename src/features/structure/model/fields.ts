/**
 * The fields in which two definitions differ, for the table **field**, **left**, **right** of the inspector island:
 * sub-documents are compared inside, everything else as a whole, the order of fields and the BSON type of numbers
 * left aside. The comparison of documents of the compare area does more (arrays element by element, ignored paths);
 * a definition needs only this.
 */
import type { Json } from '../../../shared/engine-request';
import type { DefinitionField } from '../types';
import { isDocument, isSame } from './values';

/** The most fields listed for one difference (Datardo's choice). */
export const mostFields = 200;

function collect(left: Json | undefined, right: Json | undefined, path: string, rows: DefinitionField[]): void {
  if (isSame(left, right) || rows.length >= mostFields) {
    return;
  }
  if (isDocument(left) && isDocument(right)) {
    const names = [...Object.keys(left), ...Object.keys(right).filter((name) => !(name in left))];
    for (const name of names) {
      collect(left[name], right[name], path === '' ? name : `${path}.${name}`, rows);
    }
    return;
  }
  rows.push({
    path: path === '' ? '(definition)' : path,
    ...(left === undefined ? {} : { left }),
    ...(right === undefined ? {} : { right }),
  });
}

/** The fields of two definitions that differ, the left's fields in their order and then those only on the right. */
export function differingFields(left: Json | undefined, right: Json | undefined): readonly DefinitionField[] {
  const rows: DefinitionField[] = [];
  collect(left, right, '', rows);
  return rows.slice(0, mostFields);
}
