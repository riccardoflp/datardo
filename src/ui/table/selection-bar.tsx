/**
 * The selection bar of the table (`table.selection-bar`, `@selection-bar`), between the query bar and the table while
 * more than one row is selected: **3 selected**, said to a screen reader as it changes, **Copy as** with the formats
 * of several documents (`table.copy-as`), the buttons of the other areas once built, and **Clear**. Its place is kept
 * while it is empty, so that the table does not move when it comes and goes.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { selectedDocuments } from '../../features/table/selection';
import { view, type SelectionBarView, type SelectionButton } from '../../features/table/selection-bar';
import { text } from '../../features/table/text';
import { emptySelection } from '../../features/table/types';
import { isBuilt } from '../query/built';
import { changeQuery } from '../query/collection-store';
import { idsOf, startOnDocuments } from '../pages/document/document-actions';
import { copyDocuments } from './table-start';
import type { TablePartProps } from './table-parts';
import styles from './table-panels.module.css';

function CopyAs({ bar, props }: { readonly bar: SelectionBarView; readonly props: TablePartProps }) {
  const { collection, collectionRef, columns } = props;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={styles['button']} data-feature={bar.copyAs.element}>
          {bar.copyAs.label}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles['menu']} aria-label={text.names.copyAsMenu} align="start">
          {bar.copyAs.formats.map((each) => (
            <DropdownMenu.Item
              key={each.format}
              className={styles['item']}
              data-feature={bar.copyAs.element}
              title={each.description}
              onSelect={() => {
                const documents = selectedDocuments(collection.query.selection, collection.documents);
                copyDocuments(collectionRef, columns, { documents, format: each.format }, bar.copyAs.element);
              }}
            >
              {each.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Other({
  button,
  onPress,
}: {
  readonly button: SelectionButton | undefined;
  readonly onPress?: () => void;
}): React.JSX.Element | null {
  if (button === undefined || !isBuilt(button.element)) {
    return null;
  }
  return (
    <button
      type="button"
      className={styles['button']}
      data-feature={button.element}
      title={button.tip}
      onClick={onPress}
    >
      {button.label}
    </button>
  );
}

/** The selection bar. */
export function SelectionBar(props: TablePartProps): React.JSX.Element {
  const { collection, collectionRef, target } = props;
  const selected = selectedDocuments(collection.query.selection, collection.documents);
  const bar = view({ selected, target });
  return (
    <div
      className={styles['selection-bar']}
      data-feature="table.selection-bar@selection-bar"
      role="toolbar"
      aria-label={text.names.selectionBar}
      data-empty={bar === undefined ? 'true' : undefined}
    >
      <span className={styles['count']} role="status">
        {bar?.count ?? ''}
      </span>
      {bar === undefined ? null : (
        <>
          <CopyAs bar={bar} props={props} />
          <Other button={bar.export} />
          <Other
            button={bar.update}
            onPress={() => {
              void startOnDocuments(collectionRef, bar.update?.element ?? '', { ids: idsOf(selected) });
            }}
          />
          <Other
            button={bar.delete}
            onPress={() => {
              void startOnDocuments(collectionRef, bar.delete?.element ?? '', { ids: idsOf(selected) });
            }}
          />
          <button
            type="button"
            className={styles['button']}
            data-feature={bar.clear.element}
            title={bar.clear.tip}
            onClick={() => {
              changeQuery(collectionRef.tab, (query) => ({ ...query, selection: emptySelection }));
            }}
          >
            {bar.clear.label}
          </button>
        </>
      )}
    </div>
  );
}
