/**
 * **Draw** and **Save chart as picture…** from Go to and their keys (`palette.run-command`): the aggregation of the
 * chart of the active collection tab (`chart.draw`), and its picture (`chart.save-picture`), which Go to offers only
 * once a chart is drawn. **Chart** itself (`chart.show`) is started through the bridge like any other command.
 */
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import { collectionRefOf } from '../../query/collection-reads';
import { draw, savePicture } from './chart-actions';
import { canvasOf, chartMemoryOf } from './chart-store';

/** Whether a command is carried out here. */
export function isChartCommand(id: string): boolean {
  return id === 'chart.draw' || id === 'chart.save-picture';
}

/** Whether Go to offers a command of the Chart section, as only the window knows: the picture once a chart is drawn. */
export function isChartOfferedNow(id: string, state: AppState): boolean {
  if (id !== 'chart.save-picture') {
    return true;
  }
  const active = activeTabOf(state.tabs);
  if (active === undefined || active.section !== 'chart') {
    return false;
  }
  return chartMemoryOf(active.id).drawn?.data.empty === undefined && canvasOf(active.id) !== undefined;
}

/** Runs **Draw** or **Save chart as picture…** on the active collection tab. */
export function runChartCommand(id: string, state: AppState): void {
  const active = activeTabOf(state.tabs);
  const ref = active === undefined ? undefined : collectionRefOf(active.id);
  if (ref === undefined || active?.section !== 'chart') {
    return;
  }
  if (id === 'chart.draw') {
    void draw(ref);
  } else if (isChartOfferedNow(id, state)) {
    savePicture(ref);
  }
}
