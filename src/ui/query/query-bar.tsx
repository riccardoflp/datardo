/**
 * The query bar of a collection tab (`query.bar`): the mode switch, the five fields, **Builder**, **Queries**, **Reset**
 * and the run button, which reads **Cancel** while a query runs; under it the builder when it is open, then the error
 * line. While a cell or a column header of the table is dragged, the zones of `query.drag` cover the fields. In a
 * section that runs something else from the bar (the Schema section's **Analyze**, the Explain section's **Explain**),
 * the run button and `Enter` start that instead ({@link RunInstead}).
 */
import { useEffect } from 'react';
import { view, type BarButton } from '../../features/query/bar';
import { view as dragView } from '../../features/query/drag';
import { BarFields } from './bar-fields';
import { pressRun, resetBar, toggleBuilder } from './bar-actions';
import { isBuilt } from './built';
import type { CollectionRef } from './collection-reads';
import type { CollectionTab } from './collection-store';
import { draggedOver, endDrag, useDragged } from './drag-data';
import { ErrorLine } from './error-line';
import { ModeMenu } from './mode-menu';
import { QueryBuilder } from './query-builder';
import { QueriesButton } from '../pages/saved-query/queries-list';
import styles from './query-bar.module.css';
import { spokenName } from './spoken-name';

/** What the run button does in a section that runs something else from the bar: its label, its element, its run. */
export interface RunInstead {
  readonly label: string;
  readonly element: string;
  readonly run: () => void;
}

function pressed(ref: CollectionRef, button: BarButton): void {
  switch (button.element) {
    case 'query.builder@query-bar':
      toggleBuilder(ref);
      return;
    case 'query.reset@query-bar':
      resetBar(ref);
      return;
    case 'query.run@query-bar':
    case 'runner.cancel@list':
      pressRun(ref);
      return;
    default:
      return;
  }
}

function Button({
  button,
  collectionRef,
  instead,
}: {
  readonly button: BarButton;
  readonly collectionRef: CollectionRef;
  readonly instead?: RunInstead | undefined;
}) {
  const run = button.element === 'query.run@query-bar' || button.element === 'runner.cancel@list';
  if (run && instead !== undefined) {
    return (
      <button
        type="button"
        className={`${styles['button'] ?? ''} ${styles['run'] ?? ''}`}
        data-feature={instead.element}
        onClick={instead.run}
      >
        {instead.label}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`${styles['button'] ?? ''} ${run ? (styles['run'] ?? '') : ''}`}
      data-feature={button.element}
      aria-label={spokenName(button.name, button.label)}
      title={button.tip}
      aria-pressed={button.pressed}
      onClick={() => {
        pressed(collectionRef, button);
      }}
    >
      {button.label}
    </button>
  );
}

/** A drag ends however it ends: dropped, let go outside a zone, or stopped with `Esc`. */
function useDragEnd(): void {
  useEffect(() => {
    const ended = (): void => {
      endDrag();
    };
    window.addEventListener('dragend', ended);
    window.addEventListener('drop', ended);
    return () => {
      window.removeEventListener('dragend', ended);
      window.removeEventListener('drop', ended);
    };
  }, []);
}

/** The query bar. */
export function QueryBar({
  collectionRef,
  collection,
  pipeline,
  instead,
}: {
  readonly collectionRef: CollectionRef;
  readonly collection: CollectionTab;
  /** The pipeline editor of the aggregate area, drawn under the row in Aggregate. */
  readonly pipeline?: React.ReactNode;
  /** What the run button and `Enter` start in place of the query. */
  readonly instead?: RunInstead;
}): React.JSX.Element {
  const bar = view({ query: collection.query, running: collection.running });
  const what = useDragged();
  useDragEnd();
  const dragged =
    what === undefined || bar.pipeline
      ? undefined
      : { what, zones: dragView({ dragged: what, texts: collection.query.texts }) };
  return (
    <div
      className={styles['bar']}
      role="search"
      data-feature="query.bar@query-bar"
      onDragEnter={(event) => {
        draggedOver(event.dataTransfer);
      }}
    >
      <div className={styles['row']}>
        <ModeMenu mode={bar.mode} collectionRef={collectionRef} />
        <BarFields
          input={{
            collectionRef,
            collection,
            fields: bar.fields,
            ...(dragged === undefined ? {} : { dragged }),
            ...(instead === undefined ? {} : { run: instead.run }),
          }}
        />
        <div className={styles['buttons']}>
          {bar.buttons
            .filter((button) => isBuilt(button.element))
            .map((button) =>
              button.element === 'saved-query.show@query-bar' ? (
                <QueriesButton
                  key={button.element}
                  collectionRef={collectionRef}
                  label={button.label}
                  spoken={spokenName(button.name, button.label)}
                  {...(button.tip === undefined ? {} : { tip: button.tip })}
                  className={styles['button'] ?? ''}
                />
              ) : (
                <Button key={button.element} button={button} collectionRef={collectionRef} instead={instead} />
              ),
            )}
        </div>
      </div>
      {bar.pipeline ? pipeline : null}
      {bar.builderOpen ? <QueryBuilder collectionRef={collectionRef} collection={collection} /> : null}
      {bar.errorLine === undefined ? null : (
        <ErrorLine key={bar.errorLine.message} line={bar.errorLine} collectionRef={collectionRef} />
      )}
    </div>
  );
}
