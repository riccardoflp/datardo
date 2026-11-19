/**
 * The actions of the table area the runner carries out for app steps: remembering the columns of a collection
 * (`table.expand`, `table.collapse`, `table.arrange-columns`), in the app's state and in `state/<connection id>.json`.
 */
import { saveColumns } from '../table';
import type { AreaActions } from '.';

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  'table.save-columns': (args) => saveColumns(services, args),
});
