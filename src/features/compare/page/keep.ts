/**
 * `compare.show` started by its page with `{ keep: { tab, choices } }`: the app step `compare.keep` gives the tab the
 * title of its sides and keeps the sides and the options in its memory, so that a restored tab compares them again
 * (`tab.restore`). It is an Operation with an app step, as D57 says of what Datardo remembers.
 */
import { run, type Context, type Outcome } from '../../../shared/feature';
import { appPlan, appStep } from '../../nav/types';
import { text } from '../text';
import { choicesOf, keptOf } from './memory';

/** The app action that keeps the sides and the options of a comparison with its tab (`src/main/actions/compare.ts`). */
export const keepAction = 'compare.keep';

function choicesRecord(value: unknown): Readonly<Record<string, string>> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

/** The plan that keeps what the page shows with its tab; nothing when the tab is gone. */
export function keepPlan(context: Context, keep: unknown): Outcome {
  const fields = typeof keep === 'object' && keep !== null ? (keep as Readonly<Record<string, unknown>>) : {};
  const tab = context.state.tabs.tabs.find((each) => each.id === fields['tab']);
  const choices = choicesRecord(fields['choices']);
  const kept = tab === undefined || choices === undefined ? undefined : keptOf(tab.shows, choices);
  if (tab === undefined || kept === undefined) {
    return run(appPlan(text.keepPlan, []));
  }
  const title = text.title(kept.left.collection, kept.right?.collection);
  const step = appStep(text.keepStep(title), keepAction, { tab: tab.id, title, choices: choicesOf(kept) });
  return run(appPlan(text.keepPlan, [step]));
}
