/**
 * One task of the Scheduled tasks page (`task.show`): the **Enabled** switch (`task.enable@list`), the name and the
 * kind, the source in its connection's color, the schedule, the next run, the last run, **Run now**
 * (`task.run@list`) or **Cancel** (`task.cancel@list`), and the `…` button of its menu (`task.edit@item-menu`,
 * `task.delete@item-menu`). A click or `Enter` opens and closes its details, a double click edits it
 * (`task.edit@list`), `Delete` deletes it (`task.delete@list`), the context menu and `Shift+F10` open its menu.
 */
import { useState } from 'react';
import type { ItemView } from '../../../features/task/show';
import { startFeature } from '../../shell/intent';
import { TaskDetails } from './task-details';
import { TaskMenu, type OpenTaskMenu } from './task-menu';
import { select, toggleDetails } from './tasks-store';
import styles from './tasks-page.module.css';

/** `Delete` on the selected item. */
const deleteKey = 'task.delete@list';

function onKey(event: React.KeyboardEvent, item: ItemView, openMenu: (menu: OpenTaskMenu) => void): void {
  if (event.target !== event.currentTarget) {
    return;
  }
  const box = event.currentTarget.getBoundingClientRect();
  const action =
    event.key === 'Enter'
      ? () => {
          toggleDetails(item.id);
        }
      : event.key === 'Delete'
        ? () => {
            startFeature('task.delete', { place: 'list', args: { task: item.id } });
          }
        : event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')
          ? () => {
              openMenu({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
            }
          : undefined;
  if (action !== undefined) {
    event.preventDefault();
    action();
  }
}

function RunButton({ item }: { readonly item: ItemView }): React.JSX.Element {
  const button = item.button;
  return (
    <button
      type="button"
      className={styles['button']}
      data-feature={button.element}
      title={button.tooltip}
      onClick={(event) => {
        event.stopPropagation();
        startFeature(button.kind === 'run' ? 'task.run' : 'task.cancel', { place: 'list', args: { task: item.id } });
      }}
    >
      {button.label}
    </button>
  );
}

function Switch({ item }: { readonly item: ItemView }): React.JSX.Element {
  return (
    <input
      type="checkbox"
      role="switch"
      className={styles['switch']}
      checked={item.enabled.on}
      title={item.enabled.tooltip}
      aria-label={item.enabled.tooltip}
      data-feature={item.enabled.element}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onChange={() => {
        startFeature('task.enable', { place: 'list', args: { task: item.id, enabled: !item.enabled.on } });
      }}
    />
  );
}

/** One task of the list. */
export function TaskItem(props: { readonly item: ItemView; readonly selected: boolean }): React.JSX.Element {
  const { item } = props;
  const [menu, setMenu] = useState<OpenTaskMenu | undefined>(undefined);
  return (
    <li
      className={styles['item']}
      tabIndex={0}
      aria-label={item.name}
      data-selected={props.selected ? 'true' : undefined}
      data-greyed={item.greyed ? 'true' : undefined}
      data-feature={item.open}
      data-delete-feature={deleteKey}
      onClick={() => {
        toggleDetails(item.id);
      }}
      onFocus={() => {
        select(item.id);
      }}
      onDoubleClick={() => {
        startFeature('task.edit', { place: 'list', args: { task: item.id } });
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        onKey(event, item, setMenu);
      }}
    >
      <div className={styles['row']}>
        <Switch item={item} />
        <div className={styles['name']}>
          <button
            type="button"
            className={styles['disclosure']}
            tabIndex={-1}
            aria-expanded={item.details !== undefined}
            onClick={(event) => {
              event.stopPropagation();
              toggleDetails(item.id);
            }}
          >
            {item.name}
          </button>
          <span className={styles['muted']}>{item.kind}</span>
        </div>
        <span
          className={styles['source']}
          data-color={item.source.color}
          data-removed={item.source.removed ? 'true' : undefined}
        >
          {item.source.text}
        </span>
        <span className={styles['cell']}>{item.schedule}</span>
        <span className={styles['cell']}>{item.next}</span>
        <span className={styles['cell']} data-status={item.last.status}>
          {item.last.text}
          {item.last.when === undefined ? '' : ` · ${item.last.when}`}
          {item.last.details === undefined ? null : <span className={styles['muted']}>{item.last.details}</span>}
        </span>
        <RunButton item={item} />
        <TaskMenu item={item} menu={menu} setMenu={setMenu} />
      </div>
      {item.details === undefined ? null : <TaskDetails details={item.details} />}
    </li>
  );
}
