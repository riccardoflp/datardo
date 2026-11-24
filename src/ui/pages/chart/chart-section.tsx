/**
 * The Chart section of a collection tab (`chart.show`): the query bar, whose run button reads **Draw**, with the
 * pipeline editor in Aggregate; a first row with the types, **Data**, **Code** and **Save picture…**; a second row with
 * the fields and options of the type (`chart.options`) and **Draw**; then the line of the chart and the chart, which
 * fills the rest of the section. **Data** follows the mode of the query bar each time the section is shown, and a
 * chart already chosen is drawn then.
 */
import { useEffect, useId } from 'react';
import type { ChartInput, ChartValue, DateUnit } from '../../../features/chart/types';
import {
  modeOfQueryBar,
  suggestedFields,
  view,
  type ChartDataMode,
  type ChartSectionState,
  type ChartSectionView,
  type ControlView,
} from '../../../features/chart/show';
import { text } from '../../../features/chart/text';
import type { Json } from '../../../shared/engine-request';
import { readHints, type CollectionRef } from '../../query/collection-reads';
import type { CollectionTab } from '../../query/collection-store';
import { QueryBar } from '../../query/query-bar';
import { QueryLayout } from '../../query/query-layout';
import { PipelinePane } from '../aggregate/pipeline-editor';
import { usePipeline } from '../aggregate/pipeline-store';
import type { CollectionPageState } from '../collection/use-collection';
import type { SectionPlace } from '../manage/section-actions';
import {
  changeInput,
  chooseMode,
  chooseType,
  draw,
  filterOnMark,
  savePicture,
  showChart,
  showCodeOfChart,
} from './chart-actions';
import { ChartCanvas } from './chart-canvas';
import { useChartMemory } from './chart-store';
import styles from './chart.module.css';

/** The input with one control changed to what was typed or chosen. */
function withControl(input: ChartInput, control: ControlView['control'], value: string): ChartInput {
  switch (control) {
    case 'unit': {
      const { unit: _unit, ...rest } = input;
      return value === '' ? rest : { ...rest, unit: value as DateUnit };
    }
    case 'value':
      return { ...input, value: value as ChartValue };
    case 'limit':
      return { ...input, limit: value };
    case 'first':
    case 'second':
    case 'series':
      return { ...input, [control]: value };
  }
}

/** A control of the second row: a field typed with suggestions, a menu, or a number. */
function Control({
  collectionRef: ref,
  control,
  suggestions,
}: {
  readonly collectionRef: CollectionRef;
  readonly control: ControlView;
  readonly suggestions: string;
}): React.JSX.Element {
  const id = useId();
  const change = (value: string, how: 'typed' | 'chosen'): void => {
    changeInput(ref, (input) => withControl(input, control.control, value), how);
  };
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void draw(ref, 'toolbar');
    }
  };
  return (
    <div className={styles['control']} title={control.hint}>
      <label className={styles['label']} htmlFor={id}>
        {control.label}
      </label>
      {control.kind === 'choice' ? (
        <select
          id={id}
          className={styles['input']}
          value={control.value}
          onChange={(event) => {
            change(event.target.value, 'chosen');
          }}
        >
          {(control.choices ?? []).map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          className={styles['input']}
          data-kind={control.kind}
          type={control.kind === 'number' ? 'number' : 'text'}
          {...(control.kind === 'field' ? { list: suggestions } : { min: 1 })}
          spellCheck={false}
          autoComplete="off"
          value={control.value}
          placeholder={control.placeholder}
          aria-invalid={control.marked}
          onChange={(event) => {
            // A suggestion picked from the list arrives as one change equal to a suggestion: it is a choice.
            const picked = (event.nativeEvent as InputEvent).inputType === 'insertReplacementText';
            change(event.target.value, picked ? 'chosen' : 'typed');
          }}
          onKeyDown={onKeyDown}
        />
      )}
    </div>
  );
}

/** The first row: the types, **Data**, **Code** and **Save picture…**. */
function FirstRow({
  collectionRef: ref,
  shown,
}: {
  readonly collectionRef: CollectionRef;
  readonly shown: ChartSectionView;
}): React.JSX.Element {
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={text.section}>
      <div className={styles['group']} role="group" aria-label={text.typesLabel}>
        {shown.types.map((type) => (
          <button
            key={type.type}
            type="button"
            className={styles['button']}
            aria-pressed={type.chosen}
            title={type.hint}
            onClick={() => {
              chooseType(ref, type.type);
            }}
          >
            {type.label}
          </button>
        ))}
      </div>
      <div className={styles['group']} role="group" aria-label={shown.data.label}>
        <span className={styles['label']}>{shown.data.label}</span>
        {shown.data.choices.map((choice) => (
          <button
            key={choice.mode}
            type="button"
            className={styles['button']}
            aria-pressed={choice.chosen}
            onClick={() => {
              chooseMode(ref, choice.mode satisfies ChartDataMode);
            }}
          >
            {choice.label}
          </button>
        ))}
        {shown.data.info === undefined ? null : <span className={styles['info']}>{shown.data.info}</span>}
      </div>
      <span className={styles['spacer']} />
      <button
        type="button"
        className={styles['button']}
        onClick={() => {
          showCodeOfChart(ref);
        }}
      >
        {shown.code.label}
      </button>
      <button
        type="button"
        className={styles['button']}
        data-feature={shown.savePicture.element}
        title={shown.savePicture.hint}
        disabled={!shown.savePicture.enabled}
        onClick={() => {
          savePicture(ref);
        }}
      >
        {shown.savePicture.label}
      </button>
    </div>
  );
}

/** The state of the section, from what the window keeps of it and of the pipeline of the tab. */
function useSectionState(ref: CollectionRef): ChartSectionState {
  const memory = useChartMemory(ref.tab);
  const { draft } = usePipeline(ref.tab);
  const last = draft.shown ?? draft.stages.length - 1;
  const enabled = draft.stages.filter((stage, index) => stage.enabled && index <= last).length;
  return {
    input: memory.input,
    mode: memory.mode,
    pipeline: { enabled, ...(draft.shown === undefined ? {} : { upTo: draft.shown + 1 }) },
    ...(memory.drawn === undefined ? {} : { drawn: memory.drawn }),
    running: memory.running,
    ...(memory.error === undefined ? {} : { error: memory.error }),
    checked: memory.checked,
  };
}

/** The Chart section. */
export function ChartSection({
  collectionRef: ref,
  collection,
  page,
  place,
}: {
  /** The collection of the tab, the same object while the tab shows it. */
  readonly collectionRef: CollectionRef;
  readonly collection: CollectionTab;
  readonly page: CollectionPageState;
  readonly place: SectionPlace;
}): React.JSX.Element {
  const state = useSectionState(ref);
  const shown = view(state);
  const memory = useChartMemory(ref.tab);
  const connected = page.connectionState === 'connected';
  const suggestionsId = useId();
  const queryMode = collection.query.mode;
  // Each time the section is shown (and once connected), **Data** follows the bar and a chosen chart is drawn.
  useEffect(() => {
    if (connected) {
      showChart(ref, modeOfQueryBar(queryMode));
      void readHints(ref);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once when shown, not at each change of the bar's mode
  }, [ref, connected]);
  const hints = collection.hints.kind === 'read' ? collection.hints.fields : [];
  const documents = queryMode === 'aggregate' ? (collection.documents as readonly Json[]) : [];
  const suggestions = suggestedFields(state.mode, hints, documents);
  const run = { label: text.draw, element: 'chart.draw@query-bar', run: () => void draw(ref, 'query-bar') };
  const seriesField = memory.drawn?.options.series;
  return (
    <section className={styles['section']} aria-label={text.section}>
      <QueryLayout
        query={
          <QueryBar
            collectionRef={ref}
            collection={collection}
            instead={run}
            section="chart"
            pipeline={<PipelinePane collectionRef={ref} collection={collection} readOnly={page.readOnly} />}
          />
        }
      >
        <FirstRow collectionRef={ref} shown={shown} />
        <div className={styles['controls']} role="group" aria-label={text.optionsLabel}>
          {shown.controls.map((control) => (
            <Control
              key={`${state.input.type}-${control.control}`}
              collectionRef={ref}
              control={control}
              suggestions={suggestionsId}
            />
          ))}
          <button
            type="button"
            className={styles['button']}
            data-feature={shown.draw.element}
            disabled={!connected}
            onClick={() => void draw(ref, 'toolbar')}
          >
            {shown.draw.label}
          </button>
          <datalist id={suggestionsId}>
            {suggestions.map((field) => (
              <option key={field} value={field} />
            ))}
          </datalist>
        </div>
        {shown.message === undefined ? null : (
          <p className={styles['message']} role="alert">
            {shown.message}
          </p>
        )}
        <p className={styles['line']} role="status">
          {shown.line ?? ''}
        </p>
        <div className={styles['body']}>
          {shown.state === undefined ? null : <p className={styles['state']}>{shown.state}</p>}
          {shown.chart === undefined ? null : (
            <ChartCanvas
              tab={ref.tab}
              view={shown.chart}
              {...(seriesField === undefined ? {} : { seriesField })}
              onMark={(mark) => void filterOnMark(place, ref, mark)}
            />
          )}
        </div>
      </QueryLayout>
    </section>
  );
}
