/**
 * The toolbar of the Documents section (`table.show`, `@toolbar`): **Refresh** (`table.refresh`), **Columns**
 * (`table.columns`), which reads **Columns (2 hidden)** while columns are hidden and opens its panel, **Formatting**,
 * pressed while the Formatting view of the inspector island is shown (`nav.toggle-inspector`), the buttons of
 * the other areas once they are built, with their icons, alone while the main island is narrower than 900 px, and the
 * marks **view**, **time series** and **read-only** at the right end.
 */
import { useRef } from 'react';
import { iconsAloneUnder, view as showView, type ToolbarButton } from '../../features/table/show';
import { text } from '../../features/table/text';
import { startOnDocuments } from '../pages/document/document-actions';
import { exportShown } from '../pages/transfer/export-start';
import { startFeature } from '../shell/intent';
import { isBuilt } from '../query/built';
import { showStateOf } from '../query/collection-view';
import { useWidthOf } from '../query/query-layout';
import { ColumnsPanel } from './columns-panel';
import { toggleColumnsPanel, useColumnsPanel } from './columns-panel-store';
import { refreshTab } from './table-start';
import { toolbarFormatting, useCollectionFormatting } from './formatting-rules';
import { useAppState } from '../state/store';
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
    case 'nav.toggle-inspector@toolbar':
      startFeature('nav.toggle-inspector', { place: 'toolbar', args: { view: 'formatting', toggle: true } });
      return;
    case 'document.insert@toolbar':
      void startOnDocuments(ref, button.element);
      return;
    case 'transfer.export@toolbar':
      exportShown(ref, props.collection, props.columns, button.element);
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
  const formatting = toolbarFormatting(
    useAppState(),
    useCollectionFormatting(collectionRef, collection.ranAt),
    collectionRef,
  );
  const shown = showView({
    ...showStateOf(collection, {
      view: target.view,
      readOnly: target.readOnly,
      columns: columns.columns,
      layout: columns.layout,
    }),
    formatting,
  });
  const panelOpen = useColumnsPanel(collectionRef.tab);
  const wrap = useRef<HTMLDivElement>(null);
  // The toolbar is as wide as the main island: under 900 px the buttons with an icon show it alone.
  const width = useWidthOf(wrap);
  const iconsAlone = width > 0 && width < iconsAloneUnder;
  return (
    <div ref={wrap} className={styles['toolbar-wrap']}>
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
                title={button.tip ?? (iconsAlone && button.icon !== undefined ? button.label : undefined)}
                aria-label={iconsAlone && button.icon !== undefined ? button.label : undefined}
                aria-expanded={columnsButton ? panelOpen : undefined}
                aria-haspopup={columnsButton ? 'dialog' : undefined}
                aria-pressed={button.pressed}
                onClick={() => {
                  pressed(props, button);
                }}
              >
                {button.icon === undefined ? null : (
                  <span className={`codicon codicon-${button.icon}`} aria-hidden="true" />
                )}
                {iconsAlone && button.icon !== undefined ? null : <span>{button.label}</span>}
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
