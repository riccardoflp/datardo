/**
 * Sends an intent of a control of the window area through the bridge. What follows (a refusal, an error) is shown by
 * the runner's notifications; the control has nothing more to do.
 */
import type { Intent } from '../../../shared/bridge';

/** Starts the feature an intent names, without waiting for it. */
export function startIntent(intent: Intent): void {
  window.datardo.start(intent).catch((error: unknown) => {
    // The bridge itself failed: nothing reached the runner, and nothing can be shown through it.
    console.error(`${intent.feature} could not be started:`, error);
  });
}
