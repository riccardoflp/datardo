/**
 * The plans of the controls of the Watch changes page: they write nothing to a deployment and cannot be undone. Those
 * that change the page carry an app step the main process carries out on the page's state (`page/state.ts`); those
 * that open the stream start `watch.stream` on the page's tab.
 */
import type { Json } from '../../../shared/engine-request';
import { noDanger, run, type After, type AppStep, type Outcome } from '../../../shared/feature';
import { featureId, type TabId } from '../../../shared/ids';
import type { StreamArgs } from '../stream';
import { controlText } from '../text';

/** A plan of the page: its app steps, then what follows. */
export function pagePlan(title: string, steps: readonly AppStep[], after: readonly After[] = []): Outcome {
  return run({ title, steps, danger: noDanger, undo: { cannot: controlText.nothingWritten }, publishes: false, after });
}

/** An app step on the page of a tab. */
export function pageStep(text: string, action: string, args: Json): AppStep {
  return { kind: 'app', text, action, args };
}

/** What follows that opens the stream of the page's tab with these arguments. */
export function startStream(tab: TabId, args: StreamArgs): After {
  return {
    kind: 'start',
    feature: featureId('watch.stream'),
    target: { kind: 'tab', tab },
    args: args as unknown as Json,
  };
}
