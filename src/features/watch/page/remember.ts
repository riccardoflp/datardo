/**
 * What a Watch changes page remembers, changed from its toolbar: the type toggles and the search
 * (`watch.visible-events`), and, while the stream is not open, the text of **Filter** and **Current document on
 * update** (`watch.stream` remembers them when it opens the stream). The tab keeps them, also across a restart
 * (`tab.restore`). The app step `watch.remember` changes the page; it writes nothing to a deployment.
 *
 * Started on the page's tab with what changed: `{ hiddenTypes }`, `{ search }`, `{ filter }` or `{ fullDocument }`.
 */
import type { Json } from '../../../shared/engine-request';
import { featureId } from '../../../shared/ids';
import type { Answers, Context, OperationFeature, Outcome } from '../../../shared/feature';
import type { WatchMemory } from '../../../shared/state/watch';
import { objectOf } from '../../history/types';
import { rememberText } from '../text';
import { categoryOf, eventCategories } from '../types';
import { pagePlan, pageStep } from './plans';
import { contextPage } from './state';

/** The identifier of the operation, a variant of the card of the toggles and the search. */
export const rememberId = 'watch.visible-events:remember';

/** What the arguments change of what the page remembers; fields that are not one are left out. */
export function memoryChange(args: Json): Partial<WatchMemory> {
  const fields = objectOf(args);
  const hidden = fields['hiddenTypes'];
  return {
    ...(Array.isArray(hidden)
      ? {
          hiddenTypes: eventCategories.filter((each) =>
            hidden.some((type) => typeof type === 'string' && categoryOf(type) === each),
          ),
        }
      : {}),
    ...(typeof fields['search'] === 'string' ? { search: fields['search'] } : {}),
    ...(typeof fields['filter'] === 'string' ? { filter: fields['filter'] } : {}),
    ...(typeof fields['fullDocument'] === 'boolean' ? { fullDocument: fields['fullDocument'] } : {}),
  };
}

/** The app step that changes what the page of the tab remembers; none when the target is not a page. */
export function plan(context: Context, answers: Answers): Outcome {
  const found = contextPage(context);
  const change = memoryChange(answers['args'] as Json);
  if (found === undefined || Object.keys(change).length === 0) {
    return pagePlan(rememberText.title, []);
  }
  return pagePlan(rememberText.title, [pageStep(rememberText.step, 'watch.remember', { tab: found.tab, ...change })]);
}

/** The operation, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId(rememberId), plan };
