/**
 * The actions of the table area the runner carries out for app steps: remembering the columns of a collection
 * (`table.expand`, `table.collapse`, `table.arrange-columns`), in the app's state and in `state/<connection id>.json`;
 * and the formatting rules, in `formatting.json` (`table.add-format-rule`, `table.edit-format-rule`,
 * `table.toggle-formatting`, `connection.remove`).
 */
import { forgetConnectionFormatting, saveCollectionRules, setFormattingHidden } from '../formatting';
import { saveColumns } from '../table';
import type { AreaActions } from '.';

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  'table.save-columns': (args) => saveColumns(services, args),
  'table.save-formatting': (args) => saveCollectionRules(services, args),
  'table.set-formatting-hidden': (args) => setFormattingHidden(services, args),
  'table.forget-formatting': (args) => forgetConnectionFormatting(services, args),
});
