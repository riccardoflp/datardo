/**
 * The analysis of an Index advisor tab: the reads `parts/reading.ts › nextRead` names, one after the other, each
 * started through the bridge as the Read features the runner carries out, then what they gave. It runs when the page
 * opens, on **Refresh** and after an action of the page that ran; a newer analysis drops the replies of an older one.
 * The buttons of an advice start their feature from the page and analyze again once it ran.
 */
import type { AdvisorControl } from '../../../features/advisor/parts/words';
import {
  analysisOf,
  nextRead,
  nothingRead,
  withReply,
  withSlowOperations,
  type AnalysisInput,
  type AnalysisProgress,
} from '../../../features/advisor/parts/reading';
import type { IndexesReply } from '../../../features/advisor/read-indexes';
import type { ScopeSlowOperations } from '../../../features/advisor/read-slow-operations';
import { featureId, type Place } from '../../../shared/ids';
import { advisorTabOf, changeAdvisorTab } from './advisor-store';

/** The database `advisor.read-indexes` lists when listing the databases is refused: mongosh's default, `test`. */
const defaultDatabase = 'test';

function isCurrent(tab: string, run: number): boolean {
  return advisorTabOf(tab)?.run === run;
}

/** Reads the indexes and the slow operations of the tab's scope, then keeps the analysis. */
export async function analyze(tab: string): Promise<void> {
  const state = advisorTabOf(tab);
  if (state === undefined) {
    return;
  }
  const run = state.run + 1;
  changeAdvisorTab(tab, (now) => ({ ...now, run, analyzing: true }));
  const input: AnalysisInput = {
    connection: state.connection,
    scope: state.scope,
    fallback: state.scope.kind === 'connection' ? defaultDatabase : state.scope.database,
  };
  let progress: AnalysisProgress = nothingRead;
  for (let need = nextRead(input, progress); need !== undefined; need = nextRead(input, progress)) {
    const result = await window.datardo.start({
      feature: need.read,
      target: { kind: 'connection', connection: state.connection },
      place: 'toolbar',
      args: need.args,
    });
    if (!isCurrent(tab, run)) {
      return;
    }
    if (result.kind !== 'read') {
      const message = result.kind === 'failed' || result.kind === 'refused' ? result.message : '';
      changeAdvisorTab(tab, (now) => ({ ...now, analyzing: false, read: { kind: 'failed', message } }));
      return;
    }
    progress =
      need.key === 'slow'
        ? withSlowOperations(progress, result.result as ScopeSlowOperations)
        : withReply(progress, result.result as IndexesReply);
  }
  const read = analysisOf(input, progress);
  changeAdvisorTab(tab, (now) => ({
    ...now,
    analyzing: false,
    analyzedAt: Date.now(),
    ...(read === undefined ? {} : { read }),
  }));
}

/** Carries out a button of the page: starts its feature and analyzes again once it ran, copies, or shows more. */
export async function act(tab: string, control: AdvisorControl, place: Place): Promise<void> {
  switch (control.kind) {
    case 'copy':
      await navigator.clipboard.writeText(control.text);
      return;
    case 'toggle':
      changeAdvisorTab(tab, (now) => ({
        ...now,
        expanded: now.expanded.includes(control.advice)
          ? now.expanded.filter((each) => each !== control.advice)
          : [...now.expanded, control.advice],
      }));
      return;
    case 'start': {
      if (!control.enabled) {
        return;
      }
      const result = await window.datardo.start({
        feature: featureId(control.feature),
        target: control.target,
        place: (control.element?.split('@')[1] ?? place) as Place,
        args: control.args,
      });
      if (result.kind === 'done' && control.feature !== 'monitor.open-slow-query') {
        await analyze(tab);
      }
    }
  }
}
