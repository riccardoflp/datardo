/**
 * Which controls of a collection tab are drawn: a control is shown only when the feature it starts is built (roadmap,
 * M8), as in the tree. The features the runner starts are those of the registry; the query, table and aggregate areas
 * also have controls the window carries out itself (the bar, the builder, the menus, the columns, the pipeline editor),
 * and **Cancel** stops work of the runner.
 */
import { runnableFeatures } from '../../features/registry';

const runnable: ReadonlySet<string> = new Set(runnableFeatures().keys());

/** The feature of an element, `query.run` for `query.run@query-bar`. */
export function featureOfElement(element: string): string {
  const at = element.indexOf('@');
  return at < 0 ? element : element.slice(0, at);
}

/** Whether the control of an element is drawn: the feature it starts is built. */
export function isBuilt(element: string): boolean {
  const feature = featureOfElement(element);
  return (
    runnable.has(feature) ||
    feature.startsWith('query.') ||
    feature.startsWith('table.') ||
    feature.startsWith('aggregate.') ||
    feature === 'runner.cancel' ||
    // The queries list is a View of the saved-query area, which the window draws itself.
    feature === 'saved-query.show'
  );
}
