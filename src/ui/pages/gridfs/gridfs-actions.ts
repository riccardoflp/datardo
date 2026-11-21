/**
 * What the controls of a tab of a bucket do: a control that starts a feature starts it on the bucket with its
 * arguments, from its place; **Copy _id** and **Copy name** put their text on the clipboard and say *Copied to the
 * clipboard* on the status line.
 */
import type { GridControl } from '../../../features/gridfs/types';
import type { Place } from '../../../shared/ids';
import { startFeature } from '../../shell/intent';
import { flashCopied } from '../../table/copied-flash';

/** Carries out a control of the page or of the inspector. */
export function startControl(control: GridControl, place: Place): void {
  if (control.kind === 'copy') {
    navigator.clipboard.writeText(control.text).then(flashCopied, () => {
      // The system refused the clipboard: nothing was copied, and nothing else changes.
    });
    return;
  }
  startFeature(control.feature, { place, target: control.target, args: control.args });
}
