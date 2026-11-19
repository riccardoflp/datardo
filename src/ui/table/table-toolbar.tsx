/**
 * The toolbar of the Documents section (`table.show`, `@toolbar`): **Refresh** (`table.refresh`), **Columns**
 * (`table.columns`), which reads **Columns (2 hidden)** while columns are hidden and opens its panel, the buttons of
 * the other areas once they are built, and the marks **view**, **time series** and **read-only** at the right end.
 */
import { view as showView, type ToolbarButton } from '../../features/table/show';
import { text } from '../../features/table/text';
import { startFeature } from '../shell/intent';
import { isBuilt } from '../query/built';
import { showStateOf } from '../query/collection-view';
import { ColumnsPanel } from './columns-panel';
import { toggleColumnsPanel, useColumnsPanel } from './columns-panel-store';
import { refreshTab } from './table-start';
import type { TablePartProps } from './table-parts';
import styles from './table-panels.module.css';

function pressed(props: TablePartProps, button: ToolbarButton): void {
  const { collectionRef: ref } = props;
  switch (button.element) {
    case 'table.refresh@toolbar':
      refreshTab(ref);
      return;
    case 'table.columns@toolbar':
      toggleColumnsPanel(ref.tab);
      return;
    default: {
      const at = button.element.indexOf('@');
      startFeature(button.element.slice(0, at), {
        place: 'toolbar',
        target: { kind: 'collection', connection: ref.connection, database: ref.database, collection: ref.collection },
      });
    }
  }
}

/** The toolbar. */
export function TableToolbar(props: TablePartProps): React.JSX.Element {
  const { collection, columns, target, collectionRef } = props;
  const shown = showView(
    showStateOf(collection, {
      view: target.view,
      readOnly: target.readOnly,
      columns: columns.columns,
      layout: columns.layout,
    }),
  );
  const panelOpen = useColumnsPanel(collectionRef.tab);
  return (
    <div className={styles['toolbar-wrap']}>
      <div className={styles['toolbar']} role="toolbar" aria-label={text.names.toolbar}>
        {shown.toolbar.buttons
          .filter((button) => isBuilt(button.element))
          .map((button) => {
            const columnsButton = button.element === 'table.columns@toolbar';
            return (
              <button
                key={button.element}
                type="button"
                className={styles['button']}
                data-feature={button.element}
                title={button.tip}
                aria-expanded={columnsButton ? panelOpen : undefined}
                aria-haspopup={columnsButton ? 'dialog' : undefined}
                onClick={() => {
                  pressed(props, button);
                }}
              >
                {button.label}
              </button>
            );
          })}
        <span className={styles['marks']}>
          {shown.toolbar.marks.map((mark) => (
            <span key={mark.label} className={styles['mark']} title={mark.tip}>
              {mark.label}
            </span>
          ))}
        </span>
      </div>
      {panelOpen ? <ColumnsPanel {...props} /> : null}
    </div>
  );
}
