/**
 * The work in progress of a comparison (`runner.progress`): the page finds the item its read began, to say how far it
 * is and to stop it with **Cancel** (`runner.cancel`). An item appears only after 400 ms; a **Cancel** pressed before
 * stops it as soon as it appears.
 */
import type { WorkId } from '../../../shared/ids';
import { currentAppState } from '../../state/store';
import { changeCompareTab, compareTabOf } from './compare-store';

/** How often the page looks for the item of its read, in milliseconds. */
const lookEveryMs = 50;

/**
 * Finds the item of work of the read `feature` that the comparison `run` began, and keeps it with the tab; the
 * function returned stops looking, once the read has answered.
 */
export function watchWork(tab: string, run: number, feature: string): () => void {
  const before: ReadonlySet<WorkId> = new Set(currentAppState().runner.work.map((each) => each.id));
  let answered = false;
  const look = (): void => {
    const now = compareTabOf(tab);
    if (answered || now?.run !== run) {
      return;
    }
    const work = currentAppState().runner.work.find((each) => each.feature === feature && !before.has(each.id));
    if (work === undefined) {
      setTimeout(look, lookEveryMs);
      return;
    }
    if (now.cancelled === run) {
      void window.datardo.cancel(work.id);
      return;
    }
    changeCompareTab(tab, (each) => (each.run === run ? { ...each, work: work.id } : each));
  };
  look();
  return () => {
    answered = true;
  };
}

/** **Cancel**: stops the item of work of the comparison, now or as soon as it appears. */
export function askCancel(tab: string, run: number): void {
  const work = compareTabOf(tab)?.work;
  changeCompareTab(tab, (each) => ({ ...each, cancelled: run }));
  if (work !== undefined) {
    void window.datardo.cancel(work);
  }
}

/** What the status line says of the comparison of a tab: the detail of its item of work, when it has one. */
export function workDetail(tab: string): string | undefined {
  const work = compareTabOf(tab)?.work;
  return work === undefined ? undefined : currentAppState().runner.work.find((each) => each.id === work)?.detail;
}
