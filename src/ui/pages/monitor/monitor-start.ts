/**
 * How a Monitor page tab starts a feature of the page through the bridge, on its connection, and what a start that
 * gave no result says.
 */
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { featureId, type ConnectionId, type Place } from '../../../shared/ids';

/** Starts a feature of the page on the tab's connection and waits for what it gives. */
export function startOn(
  state: { readonly connection: ConnectionId },
  feature: string,
  place: Place,
  args: Json,
): Promise<IntentResult> {
  return window.datardo.start({
    feature: featureId(feature),
    target: { kind: 'connection', connection: state.connection },
    place,
    args,
  });
}

/** The message of an intent that did not give a result. */
export function messageOf(result: IntentResult): string | undefined {
  return result.kind === 'failed' || result.kind === 'refused' ? result.message : undefined;
}

/** What a Read gave, or `undefined` when it gave nothing (it failed, it was refused or cancelled). */
export function readOf(result: IntentResult): unknown {
  return result.kind === 'read' ? result.result : undefined;
}
