/**
 * The mode switch of the query bar, **Find ▾** (`query.mode`): a menu of the modes, the one the tab is in ticked.
 * **Aggregate** is drawn once the aggregate area is built (M19): until then the menu holds **Find** alone.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { BarView } from '../../features/query/bar';
import { isBuilt } from './built';
import { switchMode } from './bar-actions';
import type { CollectionRef } from './collection-reads';
import styles from './query-bar.module.css';
import { spokenName } from './spoken-name';

/** The modes a tab can switch to: Aggregate needs the pipeline editor of the aggregate area. */
const modeFeatures = { find: 'query.run', aggregate: 'aggregate.show' } as const;

/** The mode switch. */
export function ModeMenu({
  mode,
  collectionRef,
}: {
  readonly mode: BarView['mode'];
  readonly collectionRef: CollectionRef;
}): React.JSX.Element {
  const entries = mode.entries.filter((entry) => isBuilt(modeFeatures[entry.mode]));
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={styles['button']}
          data-feature={mode.element}
          aria-label={spokenName(mode.name, mode.label)}
        >
          {mode.label} <span className="codicon codicon-chevron-down" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles['menu']} aria-label={mode.name} align="start">
          {entries.map((entry) => (
            <DropdownMenu.CheckboxItem
              key={entry.mode}
              className={styles['item']}
              data-feature={mode.element}
              title={entry.tip}
              checked={entry.ticked}
              onSelect={() => {
                switchMode(collectionRef, entry.mode);
              }}
            >
              <span className={styles['tick']} aria-hidden="true">
                <DropdownMenu.ItemIndicator>
                  <span className="codicon codicon-check" />
                </DropdownMenu.ItemIndicator>
              </span>
              {entry.label}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
