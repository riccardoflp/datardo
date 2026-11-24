/**
 * The Schema section of a collection tab (`schema.show`): the query bar, whose run button reads **Analyze**; the
 * toolbar with the line of the analysis, **Sample**, **Validation rules…**, **Generate…**, **Expand all** and
 * **Collapse all**; then the table of the fields, or the message that takes its place. The sample is read each time
 * the section is shown, once the connection is connected.
 */
import { useEffect } from 'react';
import type { SampleResult } from '../../../features/schema/sample';
import { view, type SchemaSectionState, type SchemaSectionView } from '../../../features/schema/show';
import { text } from '../../../features/schema/text';
import type { TabSample } from '../../../shared/state/schema';
import type { CollectionRef } from '../../query/collection-reads';
import type { CollectionTab } from '../../query/collection-store';
import { QueryBar } from '../../query/query-bar';
import { QueryLayout } from '../../query/query-layout';
import { useAppState } from '../../state/store';
import type { CollectionPageState } from '../collection/use-collection';
import { showSection, type SectionPlace } from '../manage/section-actions';
import { analyze, chooseSize, expandFields, filterOn, generate } from './schema-actions';
import { useSchemaMemory, type SchemaMemory } from './schema-store';
import { SchemaTable } from './schema-table';
import styles from './schema.module.css';

/** The state of the section, from what the window keeps and the tab's sample in the app's state. */
export function sectionState(memory: SchemaMemory, sample: TabSample | undefined, isView: boolean): SchemaSectionState {
  const ended = sample?.ended;
  return {
    size: memory.size,
    expanded: memory.expanded,
    running: sample?.running === true,
    ...(sample?.result === undefined ? {} : { result: sample.result as unknown as SampleResult }),
    ...(ended?.kind === 'failed' ? { error: ended.message } : {}),
    invalidFilter: memory.invalidFilter,
    cancelled: ended?.kind === 'cancelled',
    view: isView,
  };
}

interface ToolbarProps {
  readonly shown: SchemaSectionView;
  readonly collectionRef: CollectionRef;
  readonly place: SectionPlace;
}

function Toolbar({ shown, collectionRef: ref, place }: ToolbarProps): React.JSX.Element {
  const { toolbar } = shown;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={text.section}>
      <span className={styles['line']} role="status">
        {toolbar.line}
      </span>
      <label className={styles['sample']} title={toolbar.sample.hint}>
        {toolbar.sample.label}
        <select
          className={styles['select']}
          data-feature={toolbar.sample.element}
          value={toolbar.sample.sizes.find((size) => size.chosen)?.size}
          onChange={(event) => {
            chooseSize(ref, Number(event.target.value));
          }}
        >
          {toolbar.sample.sizes.map((size) => (
            <option key={size.size} value={size.size}>
              {size.label}
            </option>
          ))}
        </select>
      </label>
      {toolbar.validationRules === undefined ? null : (
        <button
          type="button"
          className={styles['button']}
          onClick={() => {
            showSection(place, 'validation', 'toolbar');
          }}
        >
          {toolbar.validationRules.label}
        </button>
      )}
      <button
        type="button"
        className={styles['button']}
        data-feature={toolbar.generate.element}
        disabled={!toolbar.generate.enabled}
        onClick={() => {
          generate(ref);
        }}
      >
        {toolbar.generate.label}
      </button>
      {[toolbar.expandAll, toolbar.collapseAll].map((button) => (
        <button
          key={button.label}
          type="button"
          className={styles['button']}
          onClick={() => {
            expandFields(ref, button.next);
          }}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}

/** The Schema section. */
export function SchemaSection({
  place,
  collectionRef: ref,
  collection,
  page,
}: {
  readonly place: SectionPlace;
  /** The collection of the tab, the same object while the tab shows it. */
  readonly collectionRef: CollectionRef;
  readonly collection: CollectionTab;
  readonly page: CollectionPageState;
}): React.JSX.Element {
  const memory = useSchemaMemory(ref.tab);
  const sample = useAppState().schema.samples[ref.tab];
  const shown = view(sectionState(memory, sample, page.view));
  const connected = page.connectionState === 'connected';
  useEffect(() => {
    if (connected) {
      void analyze(ref);
    }
  }, [ref, connected]);
  const run = { ...shown.queryBarButton, run: () => void analyze(ref, 'query-bar') };
  return (
    <section className={styles['section']} aria-label={text.section}>
      <QueryLayout query={<QueryBar collectionRef={ref} collection={collection} instead={run} section="schema" />}>
        <Toolbar shown={shown} collectionRef={ref} place={place} />
        <div className={styles['body']}>
          {shown.message === undefined ? null : <p className={styles['message']}>{shown.message}</p>}
          {shown.cancelled === undefined ? null : (
            <p className={styles['message']}>
              {shown.cancelled.text}{' '}
              <button
                type="button"
                className={styles['button']}
                data-feature={shown.cancelled.element}
                onClick={() => void analyze(ref, 'toolbar')}
              >
                {shown.cancelled.runAgain}
              </button>
            </p>
          )}
          {shown.rows.length === 0 ? null : (
            <SchemaTable
              shown={shown}
              onFilter={(control) => void filterOn(ref, control)}
              onExpand={(expanded) => {
                expandFields(ref, expanded);
              }}
            />
          )}
          {shown.note === undefined ? null : <p className={styles['note']}>{shown.note}</p>}
        </div>
      </QueryLayout>
    </section>
  );
}
