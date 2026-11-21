/**
 * What the Chart section starts through the bridge (`chart.show`): the aggregation of the chart (`chart.draw`) on
 * **Draw**, `Enter` in a field, the button of the query bar and each change of a complete choice; a click on a mark
 * (`chart.filter-from-mark`), after which the tab shows its documents in **Find** and runs the query; **Save picture…**
 * (`chart.save-picture`) with the picture of the canvas; and **Code** (`codegen.show`) on the aggregation of the chart.
 * Only the last draw of a tab is shown; a filter refused before anything is sent is marked in the bar.
 */
import { chartOptions } from '../../../features/chart/options';
import { isComplete, type ChartDataMode } from '../../../features/chart/show';
import type { ChartData } from '../../../features/chart/data';
import { withType } from '../../../features/chart/options';
import type { ChartInput, ChartType } from '../../../features/chart/types';
import { editorJson } from '../../../features/aggregate/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { featureId, type Place } from '../../../shared/ids';
import { switchMode, runFromBar } from '../../query/bar-actions';
import type { CollectionRef } from '../../query/collection-reads';
import { changeQuery, collectionOf } from '../../query/collection-store';
import { startFeature } from '../../shell/intent';
import { currentAppState } from '../../state/store';
import { pipelineOf } from '../aggregate/pipeline-store';
import { showSection, type SectionPlace } from '../manage/section-actions';
import { showSetFilter } from '../schema/schema-actions';
import { askCode } from '../code/code-store';
import type { ClickedMark } from './chart-config';
import { canvasOf, changeChartMemory, chartMemoryOf } from './chart-store';

function targetOf(ref: CollectionRef) {
  return {
    kind: 'collection' as const,
    connection: ref.connection,
    database: ref.database,
    collection: ref.collection,
  };
}

function start(ref: CollectionRef, feature: string, args: Json, place?: Place): Promise<IntentResult> {
  return window.datardo.start({
    feature: featureId(feature),
    target: targetOf(ref),
    ...(place === undefined ? {} : { place }),
    args,
  });
}

function isConnected(ref: CollectionRef): boolean {
  return currentAppState().connections.live[ref.connection]?.state === 'connected';
}

/** What a draw is sent with: the tab, the input, **Data**, the filter of the bar as typed and the pipeline. */
function drawArgs(ref: CollectionRef, input: ChartInput, mode: ChartDataMode): Json {
  const { query } = collectionOf(ref.tab);
  return {
    tab: ref.tab,
    connection: ref.connection,
    database: ref.database,
    collection: ref.collection,
    input: input as unknown as Json,
    data: mode,
    filter: query.texts.filter,
    pipeline: editorJson(pipelineOf(ref.tab).draft),
  };
}

function ended(ref: CollectionRef, number: number, result: IntentResult, milliseconds: number): void {
  if (chartMemoryOf(ref.tab).number !== number) {
    return;
  }
  changeChartMemory(ref.tab, (memory) => {
    const { error: _error, ...rest } = memory;
    const base = { ...rest, running: false };
    const options = chartOptions(memory.input);
    switch (result.kind) {
      case 'read':
        return options.kind === 'wrong'
          ? base
          : {
              ...base,
              drawn: { options: options.options, data: result.result as ChartData, milliseconds, mode: memory.mode },
            };
      case 'refused':
      case 'failed':
        return { ...base, error: result.message };
      case 'cancelled':
      case 'done':
        return base;
    }
  });
  if (result.kind === 'refused' && result.code === 'chart.draw/invalid-filter') {
    changeQuery(ref.tab, (query) => ({ ...query, invalid: ['filter'] }));
  }
}

/** Runs the aggregation of the chart; options that are wrong are marked, and nothing is sent. */
export async function draw(ref: CollectionRef, place?: Place): Promise<void> {
  const memory = chartMemoryOf(ref.tab);
  if (chartOptions(memory.input).kind === 'wrong') {
    changeChartMemory(ref.tab, (before) => ({ ...before, checked: true }));
    return;
  }
  const number = memory.number + 1;
  changeChartMemory(ref.tab, (before) => ({ ...before, number, running: true, checked: true }));
  const sent = Date.now();
  const result = await start(ref, 'chart.draw', drawArgs(ref, memory.input, memory.mode), place);
  ended(ref, number, result, Date.now() - sent);
}

/** How a change of the input came: typed in a field, or chosen (a suggestion, a menu, a type, **Data**). */
export type InputChange = 'typed' | 'chosen';

/** Changes the input; a choice that leaves the options complete draws again without **Draw**. */
export function changeInput(ref: CollectionRef, change: (input: ChartInput) => ChartInput, how: InputChange): void {
  changeChartMemory(ref.tab, (memory) => ({ ...memory, input: change(memory.input) }));
  if (how === 'chosen' && isComplete(chartMemoryOf(ref.tab).input) && isConnected(ref)) {
    void draw(ref, 'toolbar');
  }
}

/** A type of the first row: the fields stay, the limit as `chart.options` keeps it. */
export function chooseType(ref: CollectionRef, type: ChartType): void {
  changeInput(ref, (input) => withType(input, type), 'chosen');
}

/** **Data** chosen: the filter's documents or the pipeline's output, drawn again when the options are complete. */
export function chooseMode(ref: CollectionRef, mode: ChartDataMode): void {
  changeChartMemory(ref.tab, (memory) => ({ ...memory, mode }));
  if (isComplete(chartMemoryOf(ref.tab).input) && isConnected(ref)) {
    void draw(ref, 'toolbar');
  }
}

/** The section is shown: **Data** follows the mode of the query bar, and a chart already chosen is drawn. */
export function showChart(ref: CollectionRef, mode: ChartDataMode): void {
  changeChartMemory(ref.tab, (memory) => ({ ...memory, mode }));
  const { input } = chartMemoryOf(ref.tab);
  if (input.first.trim() !== '' && isConnected(ref)) {
    void draw(ref);
  }
}

/** A mark clicked: its conditions join the filter; the tab then shows its documents in **Find** and runs the query. */
export async function filterOnMark(place: SectionPlace, ref: CollectionRef, mark: ClickedMark): Promise<void> {
  const { drawn } = chartMemoryOf(ref.tab);
  if (drawn === undefined) {
    return;
  }
  const { options } = drawn;
  const chart = {
    type: options.type,
    first: options.first,
    ...(options.series === undefined ? {} : { series: options.series }),
    data: drawn.mode,
  };
  const args = { tab: ref.tab, ...targetOf(ref), chart, filter: collectionOf(ref.tab).query.texts.filter, mark };
  const before = currentAppState().schema.filters[ref.tab]?.number;
  const result = await start(ref, 'chart.filter-from-mark', args as unknown as Json, 'chart');
  if (result.kind === 'refused') {
    changeQuery(ref.tab, (query) => ({
      ...query,
      invalid: ['filter'],
      error: { message: result.message, runAgain: false },
    }));
    return;
  }
  if (result.kind !== 'done') {
    return;
  }
  await filterSet(ref, before);
  showSetFilter(ref);
  showSection(place, 'documents', 'chart');
  if (collectionOf(ref.tab).query.mode === 'find') {
    runFromBar(ref);
  } else {
    switchMode(ref, 'find');
  }
}

/** How long the window waits for the filter set by the main process (`query.set-filter`) to reach its state. */
const filterWaitMs = 2000;

/** Waits until the filter set by the step of `chart.filter-from-mark` is in the window's state. */
async function filterSet(ref: CollectionRef, before: number | undefined): Promise<void> {
  const until = Date.now() + filterWaitMs;
  while (currentAppState().schema.filters[ref.tab]?.number === before && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** **Save picture…**: the chart as drawn, a PNG at the resolution of the screen, written where the user chooses. */
export function savePicture(ref: CollectionRef): void {
  const { drawn } = chartMemoryOf(ref.tab);
  const canvas = canvasOf(ref.tab);
  if (drawn === undefined || canvas === undefined) {
    return;
  }
  const picture = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/u, '');
  startFeature('chart.save-picture', {
    place: 'toolbar',
    target: targetOf(ref),
    args: { collection: ref.collection, type: drawn.options.type, picture },
  });
}

/** **Code**: the Code section, on the aggregation of the chart as the controls and **Data** hold it now. */
export function showCodeOfChart(ref: CollectionRef): void {
  const { input, mode } = chartMemoryOf(ref.tab);
  const options = chartOptions(input);
  if (options.kind === 'wrong') {
    changeChartMemory(ref.tab, (memory) => ({ ...memory, checked: true }));
    return;
  }
  askCode(ref.tab, { kind: 'chart', options: options.options, mode });
  startFeature('codegen.show', { target: targetOf(ref), args: { tab: ref.tab } });
}
