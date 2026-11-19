/**
 * Feature: history.version-detail
 *
 * Shows, in the inspector island, the write selected on the document history page: its time, the buttons that restore
 * or copy its version, the notes that apply, the difference from the version before (`history.diff`) as a table
 * **field**, **before**, **after**, and the document after the write in mongosh syntax with `?` for its unknown
 * values. Nothing in it can be edited. `Enter` on the selected write shows the island and moves the focus into it.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue, prettyWidth } from '../aggregate/mongosh/format';
import { detailText, showText } from './text';
import { localDateTime } from './time/time-text';
import { isRecord, isUnknown, type DiffRow, type DiffSide, type DocumentVersion } from './types';

/** A part of a text in mongosh syntax: plain text, or a value that is not known, drawn as `?` with its tooltip. */
export type TextSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'unknown'; readonly text: string; readonly tooltip: string };

/** A control of the detail: its text, its identifier with its place, and the feature it starts with what. */
export interface DetailControl {
  readonly label: string;
  readonly element: string;
  readonly feature: string;
  readonly args: Json;
  readonly tooltip?: string;
  readonly disabled?: boolean;
}

/** One cell of the table of the difference. */
export type DiffCell =
  | { readonly kind: 'value'; readonly segments: readonly TextSegment[]; readonly type?: string }
  | { readonly kind: 'unknown'; readonly text: string; readonly tooltip: string }
  | { readonly kind: 'missing'; readonly text: string; readonly tooltip: string };

/** One line of the table: a field added, removed or changed. */
export interface DiffLine {
  readonly field: string;
  readonly kind: 'added' | 'removed' | 'changed';
  readonly before: DiffCell;
  readonly after: DiffCell;
}

/** What the detail shows. */
export type VersionDetailView =
  | { readonly kind: 'nothing-selected'; readonly text: string }
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'version';
      readonly heading: string;
      readonly buttons: readonly DetailControl[];
      readonly notes: readonly string[];
      readonly table?: { readonly columns: readonly string[]; readonly lines: readonly DiffLine[] };
      readonly noChange?: string;
      readonly document?: { readonly title: string; readonly open: boolean; readonly segments: readonly TextSegment[] };
    };

/** What the detail is drawn from. */
export interface VersionDetailInput {
  /** The page loads or failed: the detail is empty. */
  readonly pageReady: boolean;
  readonly version?: DocumentVersion;
  /** Whether the version is the current one: the newest, of a document that exists. */
  readonly current: boolean;
  /** Whether the document exists now. */
  readonly exists: boolean;
  /** The title of the operation of the undo history that made the write (`history.own-writes`). */
  readonly ownTitle?: string;
  /** The name of the connection when it is read-only. */
  readonly readOnly?: string;
  /** Whether the history is being read: the restore buttons wait. */
  readonly loading: boolean;
  readonly offsetMinutes: number;
}

/** The text that stands for an unknown value while a value is written, then cut out. */
const unknownToken = JSON.stringify('\u0000?');

function withTokens(value: Json): Json {
  if (isUnknown(value)) {
    return '\u0000?';
  }
  if (Array.isArray(value)) {
    return (value as readonly Json[]).map(withTokens);
  }
  return isRecord(value)
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withTokens(item)]))
    : value;
}

/** A value in mongosh syntax on several lines, with its unknown values as `?` segments. */
export function valueSegments(value: Json, width = prettyWidth): readonly TextSegment[] {
  const parts = formattedValue(withTokens(value), { kind: 'pretty', width }).split(unknownToken);
  return parts.flatMap((part, index): TextSegment[] => [
    ...(index === 0
      ? []
      : [{ kind: 'unknown' as const, text: detailText.unknownValue, tooltip: detailText.unknownValueTip }]),
    ...(part === '' ? [] : [{ kind: 'text' as const, text: part }]),
  ]);
}

function cellOf(side: DiffSide | undefined, type: string | undefined): DiffCell {
  if (side === undefined) {
    return { kind: 'missing', text: detailText.missing, tooltip: detailText.missingTip };
  }
  if (side.kind === 'unknown') {
    return { kind: 'unknown', text: detailText.unknownValue, tooltip: detailText.unknownValueTip };
  }
  return { kind: 'value', segments: valueSegments(side.value, 70), ...(type === undefined ? {} : { type }) };
}

/** A row of the difference as a line of the table: added when only after, removed when only before. */
export function diffLine(row: DiffRow): DiffLine {
  const kind = row.before === undefined ? 'added' : row.after === undefined ? 'removed' : 'changed';
  return {
    field: row.path,
    kind,
    before: cellOf(row.before, row.types?.[0]),
    after: cellOf(row.after, row.types?.[1]),
  };
}

function restoreButton(input: VersionDetailInput, version: DocumentVersion): DetailControl[] {
  if (version.state !== 'exact' || input.current) {
    return [];
  }
  const writable = input.exists ? showText.restoreTip : showText.insertAgainTip;
  return [
    {
      label: input.exists ? detailText.restore : detailText.insertAgain,
      element: 'document.restore-version@inspector',
      feature: 'document.restore-version',
      args: { key: version.key },
      tooltip: input.readOnly === undefined ? writable : showText.readOnly(input.readOnly),
      ...(input.loading || input.readOnly !== undefined ? { disabled: true } : {}),
    },
  ];
}

function copyButton(version: DocumentVersion): DetailControl[] {
  if (version.state !== 'exact' || version.document === undefined) {
    return [];
  }
  return [
    {
      label: detailText.copy,
      element: 'history.copy-version@inspector',
      feature: 'history.copy-version',
      args: { document: version.document, state: version.state },
      tooltip: detailText.copyTip,
    },
  ];
}

function notesOf(version: DocumentVersion, ownTitle: string | undefined): readonly string[] {
  return [
    ...(version.state === 'partial' ? [detailText.partial((version.unknown ?? []).join(', '))] : []),
    ...(version.state === 'unknown' ? [detailText.unknown] : []),
    ...(version.mismatch === undefined ? [] : [detailText.mismatch(version.mismatch)]),
    ...(ownTitle === undefined ? [] : [detailText.datardo(ownTitle)]),
  ];
}

/** The text of an oplog timestamp, as mongosh writes it. */
export function timestampText(t: number, i: number): string {
  return `Timestamp({ t: ${String(t)}, i: ${String(i)} })`;
}

/** The time of a write: its wall clock time, or the seconds of its oplog timestamp. */
export function writeTime(version: DocumentVersion): number {
  return version.write.wall ?? version.write.t * 1000;
}

function documentOf(version: DocumentVersion): Extract<VersionDetailView, { kind: 'version' }>['document'] {
  if (version.document === undefined || (version.state !== 'exact' && version.state !== 'partial')) {
    return undefined;
  }
  return {
    title: version.state === 'partial' ? detailText.partialDocument : detailText.document,
    open: version.diff.length === 0,
    segments: valueSegments(version.document),
  };
}

/** Feature: history.version-detail. What the inspector shows of the selected write. */
export function view(input: VersionDetailInput): VersionDetailView {
  if (!input.pageReady) {
    return { kind: 'empty' };
  }
  const version = input.version;
  if (version === undefined) {
    return { kind: 'nothing-selected', text: detailText.nothingSelected };
  }
  const document = documentOf(version);
  const noChange = version.diff.length === 0 && version.kind === 'update' && version.state !== 'unknown';
  const { columns } = detailText;
  return {
    kind: 'version',
    heading: detailText.heading(
      localDateTime(writeTime(version), input.offsetMinutes),
      timestampText(version.write.t, version.write.i),
    ),
    buttons: [...restoreButton(input, version), ...copyButton(version)],
    notes: notesOf(version, input.ownTitle),
    ...(version.diff.length === 0
      ? {}
      : { table: { columns: [columns.field, columns.before, columns.after], lines: version.diff.map(diffLine) } }),
    ...(noChange ? { noChange: detailText.noChange } : {}),
    ...(document === undefined ? {} : { document }),
  };
}
