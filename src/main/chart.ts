/**
 * What the chart area does in the main process: a collection tab keeps the type, the fields and the options of its
 * Chart section once a chart is drawn (`chart.draw`, After), in `TabMemory.choices`, which the session saves
 * (`tab.restore`); and the writer of **Save picture…** (`chart.save-picture`), which writes the PNG the window drew,
 * given as base64, beside the file and then renamed over it.
 */
import { rename, rm, writeFile } from 'node:fs/promises';
import { keptChartMemory } from '../features/chart/show';
import { text } from '../features/chart/text';
import { isJsonDocument, type ChartInput } from '../features/chart/types';
import type { Json } from '../shared/engine-request';
import type { Intent, IntentResult } from '../shared/bridge';
import type { AppStateHolder } from './app-state';
import { followIntents } from './bridge';
import type { MainServices } from './services';

/** Keeps the options of the Chart section of a tab after `chart.draw` read its chart. */
export function keepChartChoices(state: AppStateHolder, intent: Intent, result: IntentResult): void {
  const args = intent.args;
  if (intent.feature !== 'chart.draw' || result.kind !== 'read' || !isJsonDocument(args)) {
    return;
  }
  const { tab, input } = args;
  const open = state.get().tabs.tabs.find((each) => each.id === tab);
  if (open === undefined || open.shows.kind !== 'collection' || !isJsonDocument(input)) {
    return;
  }
  const memory = keptChartMemory(open.memory, input as unknown as ChartInput);
  const before = open.memory?.choices ?? {};
  const same = Object.entries(memory.choices ?? {}).every(([key, value]) => before[key] === value);
  if (!same) {
    state.dispatch({ slice: 'tabs', type: 'changed', tab: open.id, memory });
  }
}

/**
 * `chart.picture` `{ picture }`: the PNG of the chart, as base64, written to the file chosen; what fails says *Could not
 * save the chart:* and the system's reason.
 */
export async function writePicture(path: string, args: Json): Promise<void> {
  const picture = isJsonDocument(args) && typeof args['picture'] === 'string' ? args['picture'] : '';
  const beside = `${path}.part`;
  try {
    await writeFile(beside, Buffer.from(picture, 'base64'));
    await rename(beside, path);
  } catch (error: unknown) {
    // The part written beside is removed; a failure to remove it changes nothing of what the user is told.
    await rm(beside, { force: true }).catch(() => undefined);
    throw new Error(text.picture.couldNotSave(error instanceof Error ? error.message : String(error)));
  }
}

/** Follows the draws of the window, so that each tab keeps the options of its last chart. */
export function start(services: MainServices): Promise<void> {
  followIntents((intent, result) => {
    keepChartChoices(services.state, intent, result);
  });
  return Promise.resolve();
}
