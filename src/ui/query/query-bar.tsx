/**
 * The query bar of a collection tab (`query.bar`): the mode switch, the five fields, **Builder**, **Queries**, **Reset**
 * and the run button, which reads **Cancel** while a query runs; under it the builder when it is open, then the error
 * line. While a cell or a column header of the table is dragged, the zones of `query.drag` cover the fields.
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
import styles from './query-bar.module.css';
import { spokenName } from './spoken-name';

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

function Button({ button, collectionRef }: { readonly button: BarButton; readonly collectionRef: CollectionRef }) {
  const run = button.element === 'query.run@query-bar' || button.element === 'runner.cancel@list';
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
}: {
  readonly collectionRef: CollectionRef;
  readonly collection: CollectionTab;
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
          input={{ collectionRef, collection, fields: bar.fields, ...(dragged === undefined ? {} : { dragged }) }}
        />
        <div className={styles['buttons']}>
          {bar.buttons
            .filter((button) => isBuilt(button.element))
            .map((button) => (
              <Button key={button.element} button={button} collectionRef={collectionRef} />
            ))}
        </div>
      </div>
      {bar.builderOpen ? <QueryBuilder collectionRef={collectionRef} collection={collection} /> : null}
      {bar.errorLine === undefined ? null : (
        <ErrorLine key={bar.errorLine.message} line={bar.errorLine} collectionRef={collectionRef} />
      )}
    </div>
  );
}
