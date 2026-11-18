/**
 * Sends an intent through the bridge for a control of the shell: the feature its View named, from its place. The
 * window does not wait for it (R10.6): what follows comes back as events of the app's state.
 */
import type { Json } from '../../shared/engine-request';
import { featureId, type Place } from '../../shared/ids';
import { appTarget, type Target } from '../../shared/target';

/** What a control starts a feature with. */
export interface StartOptions {
  readonly place?: Place;
  readonly args?: Json;
  readonly target?: Target;
}

/** Starts a feature by the identifier its View gave. */
export function startFeature(feature: string, options: StartOptions = {}): void {
  void window.datardo.start({
    feature: featureId(feature),
    target: options.target ?? appTarget,
    ...(options.place === undefined ? {} : { place: options.place }),
    ...(options.args === undefined ? {} : { args: options.args }),
  });
}
