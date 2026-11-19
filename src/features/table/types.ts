/**
 * What the table area decides from: the documents of a page, the columns found in them, the columns' layout, the
 * selection of rows. Values are canonical Extended JSON, so that every BSON type is kept (D32).
 */
import type { Json } from '../../shared/engine-request';
import { noDanger, type After, type Answers, type AppStep, type Context, type Plan } from '../../shared/feature';
import { isJsonObject, type JsonObject } from '../query/mongosh/ejson';

/** A document as the table has it. */
export type Document = JsonObject;

/** A column found in a page (`table.detect-columns`). */
export interface ColumnNode {
  /** The names from the top of the document: `["address", "city"]`. */
  readonly path: readonly string[];
  /** The dotted key, as filters and sorts use it: `address.city`. */
  readonly key: string;
  /** Whether some document of the page has a sub-document with a field here, or an array of them. */
  readonly expandable: boolean;
  /** Whether expanding it gives sub-rows: some document has an array of sub-documents here. */
  readonly array: boolean;
  /** For a column inside the elements of an expanded array: the length of the array's path. */
  readonly arrayDepth?: number;
  /** The child columns, when it is expanded. */
  readonly children?: readonly ColumnNode[];
}

/** What Datardo remembers of the columns of a collection (`table.columns`): hidden, order, pinned, widths. */
export interface ColumnLayout {
  readonly hidden?: readonly string[];
  /** Keys in the order the user put them; siblings follow it, and those not in it follow in their natural order. */
  readonly order?: readonly string[];
  /** Top-level columns kept at the left while the others scroll sideways. */
  readonly pinned?: readonly string[];
  /** Widths set by hand, in px, by key. */
  readonly widths?: Readonly<Record<string, number>>;
}

/** No layout: the natural order, nothing hidden or pinned, automatic widths. */
export const naturalLayout: ColumnLayout = {};

/** How a row is known in the selection: by its `_id` as Extended JSON, or by its place in the page. */
export type RowKey = string & { readonly __brand: 'RowKey' };

/** The selected rows of a tab, and the anchor of `Shift` with a click (`table.selection`). */
export interface Selection {
  readonly keys: readonly RowKey[];
  readonly anchor?: RowKey;
}

/** No row selected. */
export const emptySelection: Selection = { keys: [] };

/** The key of a document of a page: `id:` and its `_id`, or `at:` and its place when it has none. */
export function rowKeyOf(document: Document, index: number): RowKey {
  const id: Json | undefined = document['_id'];
  return (id === undefined ? `at:${String(index)}` : `id:${JSON.stringify(id)}`) as RowKey;
}

/** The modes of a collection tab, which decide what the table offers. */
export type TableMode = 'find' | 'aggregate';

/** What the target of the table allows: a collection that can be changed, or not. */
export interface TableTarget {
  readonly mode: TableMode;
  /** A MongoDB view: nothing is written through it. */
  readonly view: boolean;
  readonly readOnly: boolean;
  readonly timeSeries?: boolean;
}

/** Whether the table offers writing documents: in Find, on a collection that is not a view, through a connection that is not read-only. */
export function canWrite(target: TableTarget): boolean {
  return target.mode === 'find' && !target.view && !target.readOnly;
}

/** Why the plans of the table cannot be undone: they write nothing to a deployment. */
export const nothingRecorded = 'Nothing is written to a deployment, so nothing is recorded.';

/** A plan of the table: no danger, nothing to undo, nothing published. */
export function tablePlan(title: string, steps: readonly AppStep[], after: readonly After[] = []): Plan {
  return { title, steps, danger: noDanger, undo: { cannot: nothingRecorded }, publishes: false, after };
}

/** The arguments an Operation was started with (`Intent.args`), as an object; empty when there are none. */
export function startArgs(answers: Answers): JsonObject {
  const args = answers['args'] as Json | undefined;
  return isJsonObject(args) ? args : {};
}

/** A text of the arguments, empty when absent. */
export function textOf(args: JsonObject, name: string): string {
  const value = args[name];
  return typeof value === 'string' ? value : '';
}

/** The texts of a list of the arguments. */
export function textsOf(args: JsonObject, name: string): readonly string[] {
  const value = args[name];
  return Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : [];
}

/** The collection a table shows, and the connection it is on. */
export interface TableCollection {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
}

/** The collection of the arguments, or of the target of the context. */
export function collectionOf(context: Context, args: JsonObject): TableCollection {
  const target = context.target.kind === 'collection' ? context.target : undefined;
  return {
    connection: textOf(args, 'connection') || (target?.connection ?? ''),
    database: textOf(args, 'database') || (target?.database ?? ''),
    collection: textOf(args, 'collection') || (target?.collection ?? ''),
  };
}

/** How a step names a collection: `Local / shop / people`, with the name of the connection. */
export function collectionLabel(context: Context, where: TableCollection): string {
  const saved = context.state.connections.saved.find((connection) => connection.id === where.connection);
  return `${saved?.name ?? where.connection} / ${where.database} / ${where.collection}`;
}

/** The step that remembers what is kept of the columns of a collection: the expanded paths, or the layout. */
export function saveColumnsStep(
  stepText: string,
  where: TableCollection,
  saved: { readonly expanded: readonly string[] } | { readonly layout: ColumnLayout },
): AppStep {
  return { kind: 'app', text: stepText, action: 'table.save-columns', args: { ...where, ...saved } as unknown as Json };
}

/** An entry of a context menu of the table: what it says, the feature it starts, a submenu; or a separator. */
export type MenuEntry =
  | {
      readonly kind: 'entry';
      readonly label: string;
      /** The feature and its place, `table.copy-as@row-menu`. */
      readonly element: string;
      readonly tip?: string;
      /** Shown but not started, with `tip` saying why. */
      readonly disabled?: boolean;
      /** What the feature is started with. */
      readonly args?: Json;
      readonly submenu?: readonly MenuEntry[];
    }
  | { readonly kind: 'separator' };

/** The groups of a menu, empty ones left out, with a separator between two. */
export function menuOf(groups: readonly (readonly MenuEntry[])[]): readonly MenuEntry[] {
  const filled = groups.filter((group) => group.length > 0);
  return filled.flatMap((group, index) => (index === 0 ? group : [{ kind: 'separator' } as const, ...group]));
}

/** Whether a key is `_id` or one of its sub-fields, which are never edited, renamed or removed from the table. */
export function isIdKey(key: string): boolean {
  return key === '_id' || key.startsWith('_id.');
}
