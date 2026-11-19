/**
 * What an entry of a context menu of the table does once chosen (`table.row-menu`, `table.cell-menu`,
 * `table.column-menu`): the Operations of the table started through the bridge on the tab's collection, and what the
 * window carries out itself: the **Columns** panel, the selection, and the conditions, sorts and projections written
 * into the bar as a drop writes them (`query.add-condition`, `query.add-sort`, `query.add-projection`).
 */
import type { Dragged, Zone, ZoneAction } from '../../features/query/drag';
import type { LayoutChange } from '../../features/table/arrange-columns';
import type { CopyFormat } from '../../features/table/copy-text';
import type { Document, MenuEntry } from '../../features/table/types';
import type { Json } from '../../shared/engine-request';
import { dropOnZone } from '../query/bar-actions';
import { featureOfElement } from '../query/built';
import type { CollectionRef } from '../query/collection-reads';
import { changeQuery, type CollectionTab } from '../query/collection-store';
import { openColumnsPanel } from './columns-panel-store';
import type { TableColumns } from './table-columns';
import { arrange, collapseColumn, copyDocuments, expandColumn, startOnCollection } from './table-start';

/** What a chosen entry acts on: the tab, the documents of the menu (the row's, or the selection), the field. */
export interface EntryContext {
  readonly ref: CollectionRef;
  readonly collection: CollectionTab;
  readonly columns: TableColumns;
  readonly documents: readonly Document[];
  /** The field of the cell or of the header, and the expanded array it is in. */
  readonly field?: { readonly key: string; readonly value?: Json; readonly within?: string };
}

/** An entry that can be chosen. */
export type ChosenEntry = Extract<MenuEntry, { readonly kind: 'entry' }>;

function argsOf(entry: ChosenEntry): { readonly [key: string]: Json } {
  const { args } = entry;
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as { readonly [key: string]: Json })
    : {};
}

function textArg(args: { readonly [key: string]: Json }, name: string): string {
  const value = args[name];
  return typeof value === 'string' ? value : '';
}

/** The action of a zone an entry of a menu stands for: the cell menu gives a condition, the header menu a zone's. */
function zoneActionOf(feature: string, args: { readonly [key: string]: Json }): ZoneAction | undefined {
  if (feature === 'query.add-condition' && 'condition' in args) {
    return { to: 'filter', condition: args['condition'] ?? null };
  }
  const to = args['to'];
  if (to === 'sort' || to === 'project') {
    return args as unknown as ZoneAction;
  }
  return undefined;
}

/** A condition, a sort or a projection of a menu written into the bar and run, as the drop of the same zone does. */
function writeIntoBar(context: EntryContext, entry: ChosenEntry, feature: string): void {
  const field = context.field;
  const action = zoneActionOf(feature, argsOf(entry));
  if (field === undefined || action === undefined) {
    return;
  }
  const zone: Zone = { label: entry.label, field: field.key, tip: entry.tip ?? '', element: entry.element, action };
  const within = field.within === undefined ? {} : { within: field.within };
  const dragged: Dragged =
    field.value === undefined
      ? { kind: 'header', field: field.key, ...within }
      : { kind: 'cell', field: field.key, value: field.value, ...within };
  dropOnZone(context.ref, zone, dragged);
}

/** Carries out an entry chosen in a menu of the table. */
export function chooseEntry(context: EntryContext, entry: ChosenEntry): void {
  const { ref, columns } = context;
  const args = argsOf(entry);
  const feature = featureOfElement(entry.element);
  switch (feature) {
    case 'table.copy-as':
      copyDocuments(
        ref,
        columns,
        { documents: context.documents, format: args['format'] as CopyFormat },
        entry.element,
      );
      return;
    case 'table.copy-value':
    case 'table.copy-path':
      void startOnCollection(ref, entry.element, args);
      return;
    case 'table.expand': {
      const expand = { key: textArg(args, 'key'), allLevels: args['allLevels'] === true };
      expandColumn(ref, { columns, documents: context.collection.documents }, expand, entry.element);
      return;
    }
    case 'table.collapse':
      collapseColumn(ref, columns, textArg(args, 'key'), entry.element);
      return;
    case 'table.arrange-columns':
      arrange(ref, columns, args['change'] as unknown as LayoutChange, entry.element);
      return;
    case 'table.columns':
      openColumnsPanel(ref.tab);
      return;
    case 'table.selection':
      changeQuery(ref.tab, (query) => ({ ...query, selection: { keys: [] } }));
      return;
    default:
      writeIntoBar(context, entry, feature);
  }
}
