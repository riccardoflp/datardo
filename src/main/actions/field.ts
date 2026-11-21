/**
 * The action of the field area the runner carries out for the second step of `field.rename` and `field.remove`
 * (`field.layout-follows`): the columns' layout of the collection follows the field, renamed to `to` or dropped
 * without it, in the app's state and in `state/<connection id>.json`, as `table.save-columns` remembers it.
 */
import type { Json } from '../../shared/engine-request';
import { rememberedColumns } from '../../shared/state/table';
import { renamedLayout } from '../../features/field/layout-follows';
import type { MainServices } from '../services';
import { saveColumns } from '../table';
import type { AreaActions } from '.';

function fieldOf(args: Json, name: string): string | undefined {
  const value =
    typeof args === 'object' && args !== null && !Array.isArray(args)
      ? (args as { readonly [key: string]: Json })[name]
      : undefined;
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function needed(args: Json, name: string): string {
  const value = fieldOf(args, name);
  if (value === undefined) {
    throw new Error(`The action needs ${name}.`);
  }
  return value;
}

/** `table.rename-in-layout`: `{ connection, database, collection, from, to? }`. */
export async function renameInLayout(services: MainServices, args: Json): Promise<void> {
  const where = {
    connection: needed(args, 'connection'),
    database: needed(args, 'database'),
    collection: needed(args, 'collection'),
  };
  const from = needed(args, 'from');
  const to = fieldOf(args, 'to');
  const before = rememberedColumns(services.state.get().table, where);
  const after = renamedLayout({ ...before.layout, expanded: before.expanded }, from, to);
  const { expanded, ...layout } = after;
  await saveColumns(services, {
    ...where,
    layout: layout as unknown as Json,
    expanded: [...expanded],
  });
}

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  'table.rename-in-layout': (args) => renameInLayout(services, args),
});
