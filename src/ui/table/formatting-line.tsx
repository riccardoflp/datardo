/**
 * A rule's line in the Formatting view (`table.formatting`): its handle to drag it, its checkbox, its swatch, **Row**
 * or the field whose cell it colors, its name or condition cut with `…`, `⚠` when it cannot be used, its `…` menu and
 * **Remove rule**. Its controls are one stop of the list's `Tab`: only the focused line's main control takes it.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { RuleLine } from '../../features/table/formatting';
import { text } from '../../features/table/text';
import type { RuleChange } from '../../features/table/edit-format-rule';
import styles from './formatting.module.css';
import menuStyles from './table-panels.module.css';

/** What a line is given. */
export interface LineProps {
  readonly line: RuleLine;
  /** Whether this line has the list's stop of `Tab`. */
  readonly active: boolean;
  /** Whether its `…` menu is open. */
  readonly menuOpen: boolean;
  readonly onMenu: (open: boolean) => void;
  readonly onChange: (change: RuleChange) => void;
  readonly onOpen: () => void;
  readonly onFocus: () => void;
  readonly onDrop: (dragged: string) => void;
}

/** The `…` menu of a line: **Move up**, **Move down**, **Remove**. */
function LineMenu(props: LineProps): React.JSX.Element {
  const { line } = props;
  return (
    <DropdownMenu.Root modal={false} open={props.menuOpen} onOpenChange={props.onMenu}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={styles['icon-button']}
          data-line-control="menu"
          tabIndex={-1}
          aria-label={line.menu.label}
          title={line.menu.label}
        >
          <span className="codicon codicon-ellipsis" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={menuStyles['menu']} aria-label={line.menu.label} align="end">
          {line.menu.entries.map((entry) => (
            <DropdownMenu.Item
              key={entry.label}
              className={menuStyles['item']}
              data-feature={entry.element}
              onSelect={() => {
                if (entry.change !== undefined) {
                  props.onChange(entry.change);
                }
              }}
            >
              {entry.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** A rule's line. */
export function FormattingLine(props: LineProps): React.JSX.Element {
  const { line } = props;
  return (
    <div
      className={styles['line']}
      data-enabled={line.enabled}
      data-open={line.open}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/x-datardo-format-rule', line.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('text/x-datardo-format-rule')) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        const dragged = event.dataTransfer.getData('text/x-datardo-format-rule');
        if (dragged !== '') {
          event.preventDefault();
          props.onDrop(dragged);
        }
      }}
      onFocus={props.onFocus}
    >
      <span
        className={`codicon codicon-gripper ${styles['handle'] ?? ''}`}
        title={text.formatting.drag}
        aria-hidden="true"
      />
      <input
        type="checkbox"
        className={styles['check']}
        data-line-control="check"
        data-feature="table.edit-format-rule@inspector"
        tabIndex={-1}
        checked={line.enabled}
        aria-label={`${line.toggle.label}: ${line.summary}`}
        title={line.toggle.label}
        onChange={() => {
          props.onChange(line.toggle.change);
        }}
      />
      {line.swatch === undefined ? null : (
        <span
          className={styles['swatch']}
          data-format={line.swatch.color}
          role="img"
          aria-label={line.swatch.name}
          title={line.swatch.name}
        />
      )}
      <button
        type="button"
        className={styles['summary']}
        data-line-control="main"
        tabIndex={props.active ? 0 : -1}
        aria-expanded={line.open}
        title={line.tooltip}
        onClick={props.onOpen}
      >
        <span className={styles['target']}>{line.target}</span>
        <span className={styles['cut']} data-named={line.named}>
          {line.summary}
        </span>
        {line.problem === undefined ? null : (
          <span className={styles['problem-mark']} role="img" aria-label={line.problem}>
            ⚠
          </span>
        )}
      </button>
      <LineMenu {...props} />
      <button
        type="button"
        className={styles['icon-button']}
        data-line-control="remove"
        data-feature="table.edit-format-rule@inspector"
        tabIndex={-1}
        aria-label={line.remove.label}
        title={line.remove.label}
        onClick={() => {
          props.onChange(line.remove.change);
        }}
      >
        <span className="codicon codicon-close" aria-hidden="true" />
      </button>
    </div>
  );
}
