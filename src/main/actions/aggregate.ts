/**
 * The actions of the aggregate area the runner carries out for app steps: setting the pipeline of a collection tab
 * (`aggregate.add-stage`, `aggregate.remove-stage`, `aggregate.move-stage` and the other Operations of the editor),
 * which the tab keeps in its memory for `tab.restore`.
 */
import { setPipeline } from '../aggregate';
import type { AreaActions } from '.';

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  'aggregate.set-pipeline': (args) => setPipeline(services.state, args),
});
