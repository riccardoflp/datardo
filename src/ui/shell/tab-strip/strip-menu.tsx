/**
 * `tab.menu`: the context menu of a tab or of a group's label, drawn from the entries its View gives. A right click,
 * `Shift+F10` or the menu key opens it on the element it wraps; an entry starts its feature from `@tab-menu`.
 */
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { MenuEntry } from '../../../features/tab/menu';
import { startFeature } from '../intent';
import styles from './tab-strip.module.css';

/** The entries of a menu, drawn in a portal over the window. */
function Entries({
  entries,
  label,
}: {
  readonly entries: readonly MenuEntry[];
  readonly label: string;
}): React.JSX.Element {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className={styles['menu']} aria-label={label} data-feature="tab.menu@tab-menu">
        {entries.map((entry, index) =>
          entry.kind === 'separator' ? (
            <ContextMenu.Separator key={`separator ${String(index)}`} className={styles['menu-separator']} />
          ) : (
            <ContextMenu.Item
              key={`${entry.element} ${entry.label}`}
              className={styles['menu-item']}
              data-feature={entry.element}
              disabled={entry.disabled}
              onSelect={() => {
                startFeature(entry.feature, { place: 'tab-menu', args: entry.args });
              }}
            >
              <span>{entry.label}</span>
              {entry.key === undefined ? null : <span className={styles['menu-key']}>{entry.key}</span>}
            </ContextMenu.Item>
          ),
        )}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}

/** Wraps an element of the strip with its context menu; the entries are asked for when the menu opens. */
export function StripMenu({
  entries,
  label,
  children,
}: {
  readonly entries: () => readonly MenuEntry[];
  readonly label: string;
  readonly children: React.JSX.Element;
}): React.JSX.Element {
  return (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <Entries entries={entries()} label={label} />
    </ContextMenu.Root>
  );
}
