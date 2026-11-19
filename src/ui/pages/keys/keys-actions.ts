/**
 * What the controls of a keys tab start: the features of one key on the key of a row (`key.open`, `key.rename`, …),
 * those of the selection with its keys in the order of the table (`key.copy-name`, `key.export`,
 * `key.delete-selected`), and those of the database (`key.new`, `key.delete-by-pattern`, `key.import`). Every one goes
 * through the bridge; the window decides nothing about it (R10.7).
 */
import { rowMenu, type KeyRow } from '../../../features/key/show';
import type { SelectView } from '../../../features/key/select';
import type { Json } from '../../../shared/engine-request';
import type { Place } from '../../../shared/ids';
import type { Target } from '../../../shared/target';
import { startFeature } from '../../shell/intent';
import type { MenuItem } from './keys-menu';
import type { KeysTab } from './keys-store';

/** The key of a row as the target of a feature. */
export function keyTarget(tab: KeysTab, row: Pick<KeyRow, 'name'>): Target {
  return { kind: 'key', connection: tab.where.connection, database: tab.where.database, key: row.name };
}

/** The database of the tab as the target of a feature. */
export function databaseTarget(tab: KeysTab): Target {
  return { kind: 'redis-database', connection: tab.where.connection, database: tab.where.database };
}

/** What the tab asks of the features of the database: its pattern as it was sent, its type, its namespace. */
export function tabArgs(tab: KeysTab, keys: readonly string[] = []): Json {
  return {
    pattern: tab.last.pattern.pattern,
    type: tab.last.type,
    ...(tab.where.namespace === undefined ? {} : { namespace: tab.where.namespace }),
    ...(keys.length === 0 ? {} : { keys: [...keys] }),
  };
}

/** Starts a feature on the key of a row, from a place. */
export function onKey(tab: KeysTab, row: Pick<KeyRow, 'name'>, feature: string, place: Place): void {
  startFeature(feature, { place, target: keyTarget(tab, row) });
}

/** Starts a feature on the selected keys, in the order of the table. */
export function onSelection(tab: KeysTab, keys: readonly string[], feature: string, place: Place): void {
  startFeature(feature, { place, target: databaseTarget(tab), args: tabArgs(tab, keys) });
}

/** **Pin** of a row: the key among the pins of the connection (`nav.pin`). */
function pinKey(tab: KeysTab, row: KeyRow): void {
  startFeature('nav.pin', {
    place: 'row-menu',
    target: { kind: 'connection', connection: tab.where.connection },
    args: {
      connection: tab.where.connection,
      pin: { kind: 'key', database: tab.where.database, keyHex: row.id },
      action: 'pin',
    },
  });
}

/** The entries of the context menu of a row: those for one key, or those of the selection when several are. */
export function rowMenuItems(input: {
  readonly tab: KeysTab;
  readonly row: KeyRow;
  readonly readOnly: boolean;
  readonly selection: SelectView;
}): readonly MenuItem[] {
  const { tab, row, selection } = input;
  if (selection.rowMenu !== undefined && row.selected) {
    return selection.rowMenu.map((entry) => ({
      label: entry.label,
      ...(entry.element === undefined ? {} : { element: entry.element }),
      choose: () => {
        onSelection(tab, selection.keys, entry.feature, 'row-menu');
      },
    }));
  }
  const read = tab.details.get(row.id);
  const hasExpiry = read === undefined || read.expiresAt !== null;
  return rowMenu(input.readOnly, hasExpiry).map((entry) => ({
    label: entry.label,
    ...(entry.element === undefined ? {} : { element: entry.element }),
    choose: () => {
      if (entry.feature === 'nav.pin') {
        pinKey(tab, row);
      } else {
        onKey(tab, row, entry.feature, 'row-menu');
      }
    },
  }));
}
