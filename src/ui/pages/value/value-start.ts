/**
 * What every read of a key tab's value shares (`value.show`): the key as the target of a feature, a Read started
 * through the bridge, the message of one that did not answer, and whether the read in progress is still the tab's
 * newest. The reads themselves are in `value-reads.ts`, `value-pages.ts` and `value-groups.tsx`.
 */
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { featureId, type Place } from '../../../shared/ids';
import type { Target } from '../../../shared/target';
import { changeValue, valueTabOf, type ValueWhere } from './value-store';

/** The key of a tab as the target of a feature. */
export function keyTarget(where: ValueWhere): Target {
  return { kind: 'key', connection: where.connection, database: where.database, key: where.key };
}

/** Starts a Read of the value area on the key, from a control of `place` (the toolbar by default). */
export async function readValue(
  where: ValueWhere,
  feature: string,
  args: Json,
  place: Place = 'toolbar',
): Promise<IntentResult> {
  return window.datardo.start({ feature: featureId(feature), target: keyTarget(where), place, args });
}

/** The message of a read that did not answer. */
export function messageOf(result: IntentResult): string {
  return result.kind === 'failed' || result.kind === 'refused' ? result.message : '';
}

/** Whether `run` is still the tab's newest read. */
export function isCurrent(tab: string, run: number): boolean {
  return valueTabOf(tab)?.run === run;
}

/** The read `run` did not answer: the tab shows the error, with **Retry**. */
export function failedRead(tab: string, run: number, result: IntentResult): void {
  changeValue(tab, (now) => (now.run === run ? { ...now, status: 'error', error: messageOf(result) } : now));
}
