/**
 * What the inspector island shows for a selected row of the comparison page (`compare.show`): the fields of a
 * different document with their two values, or the whole document of a row on one side only.
 */
import type { Json } from '../../../shared/engine-request';
import { formattedValue } from '../../query/format';
import { fieldOrderPath, relaxedValueText } from '../field-diff';
import type { DetailEntry, SelectedDocument } from '../read-details';
import { text } from '../text';
import type { Side } from '../types';

/** A cell of a side: the value in mongosh syntax with its type when the types are the only difference, or `—`. */
export interface ValueCell {
  readonly text: string;
  readonly type?: string;
  readonly hint?: string;
}

/** A row of the table of a different document; the row `(field order)` has one sentence across the two values. */
export type FieldRowView =
  | { readonly kind: 'field'; readonly path: string; readonly left: ValueCell; readonly right: ValueCell }
  | { readonly kind: 'field-order'; readonly path: string; readonly text: string };

/** What the inspector shows of a selected row. */
export type InspectorView =
  | {
      readonly kind: 'different';
      readonly columns: readonly [string, string, string];
      readonly rows: readonly FieldRowView[];
      readonly open: readonly { readonly label: string; readonly side: Side }[];
    }
  | {
      readonly kind: 'one-side';
      readonly side: Side;
      readonly missing: string;
      /** The document whole, or the sentence that says it is gone, or the server's message. */
      readonly document?: string;
      readonly message?: string;
      readonly open: { readonly label: string; readonly side: Side };
      readonly copy?: { readonly label: string; readonly text: string };
    };

function cell(value: Json | undefined, type: string | undefined): ValueCell {
  if (value === undefined) {
    return { text: text.inspector.missing, hint: text.inspector.missingHint };
  }
  // Values that differ only by type are written as relaxed Extended JSON shows them, with the type beside them.
  return type === undefined ? { text: formattedValue(value, 'one-line') } : { text: relaxedValueText(value), type };
}

/** The inspector of a different document. */
function differentView(entry: Extract<DetailEntry, { kind: 'different' }>): InspectorView {
  const rows = entry.rows.map((row): FieldRowView =>
    row.path === fieldOrderPath
      ? { kind: 'field-order', path: row.path, text: text.inspector.fieldOrder }
      : { kind: 'field', path: row.path, left: cell(row.left, row.types?.[0]), right: cell(row.right, row.types?.[1]) },
  );
  return {
    kind: 'different',
    columns: [text.inspector.field, text.inspector.left, text.inspector.right],
    rows,
    open: [
      { label: text.inspector.openLeft, side: 'left' },
      { label: text.inspector.openRight, side: 'right' },
    ],
  };
}

/** The inspector of a row on one side only, with the document read when the row was selected, when it was. */
function oneSideView(
  side: Side,
  read: SelectedDocument | { readonly kind: 'error'; readonly message: string } | undefined,
): InspectorView {
  const base = {
    kind: 'one-side' as const,
    side,
    missing: text.inspector.missingOn(side === 'left' ? 'right' : 'left'),
    open: { label: side === 'left' ? text.inspector.openLeft : text.inspector.openRight, side },
  };
  if (read === undefined) {
    return base;
  }
  if (read.kind !== 'document') {
    return { ...base, message: read.message };
  }
  const document = formattedValue(read.document, 'pretty');
  return { ...base, document, copy: { label: text.inspector.copy, text: document } };
}

/** What the inspector island shows for the selected entry. */
export function inspectorView(
  entry: DetailEntry,
  read: SelectedDocument | { readonly kind: 'error'; readonly message: string } | undefined,
): InspectorView {
  return entry.kind === 'different'
    ? differentView(entry)
    : oneSideView(entry.kind === 'only-left' ? 'left' : 'right', read);
}
