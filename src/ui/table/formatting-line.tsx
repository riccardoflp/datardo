/**
 * A rule's line in the Formatting view (`table.formatting`): its handle to drag it, its checkbox, its colors (a
 * swatch, a field rule's first values or the bar of its scale), **Row** or the field whose cell it colors, its name or
 * condition cut with `…`, `⚠` when it cannot be used, its `…` menu with **Move to** and **Copy to**, and **Remove
 * rule**. Dimmed while its field is in no document of the page. Its controls are one stop of the list's `Tab`: only
 * the focused line's main control takes it.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { MoveIntent, RuleLine } from '../../features/table/formatting';
import { text } from '../../features/table/text';
import type { RuleChange } from '../../features/table/edit-format-rule';
import type { FormatRuleId } from '../../shared/formatting-rules';
import styles from './formatting.module.css';
import menuStyles from './table-panels.module.css';

/** The type of the data a dragged line carries: its rule's id. */
export const draggedRule = 'text/x-datardo-format-rule';

/** What a line is given. */
export interface LineProps {
  readonly line: RuleLine;
  /** Whether this line has the list's stop of `Tab`. */
  readonly active: boolean;
  /** Whether its `…` menu is open. */
  readonly menuOpen: boolean;
  readonly onMenu: (open: boolean) => void;
  readonly onChange: (change: RuleChange) => void;
  readonly onMove: (move: MoveIntent) => void;
  readonly onOpen: () => void;
  readonly onFocus: () => void;
  /** A line dropped on this one: before it, or after it when dropped on its lower half. */
  readonly onDrop: (dragged: FormatRuleId, after: boolean) => void;
}

/** The `…` menu of a line: **Move up**, **Move down**, **Remove**, then **Move to** and **Copy to**. */
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
          {line.menu.submenus.length === 0 ? null : <DropdownMenu.Separator className={menuStyles['separator']} />}
          {line.menu.submenus.map((submenu) => (
            <DropdownMenu.Sub key={submenu.label}>
              <DropdownMenu.SubTrigger className={menuStyles['item']} title={submenu.tip}>
                <span>{submenu.label}</span>
                <span className="codicon codicon-chevron-right" aria-hidden="true" />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className={menuStyles['menu']} aria-label={submenu.label}>
                  {submenu.entries.map((entry) => (
                    <DropdownMenu.Item
                      key={entry.label}
                      className={menuStyles['item']}
                      data-feature={entry.element}
                      title={entry.tip}
                      onSelect={() => {
                        if (entry.move !== undefined) {
                          props.onMove(entry.move);
                        }
                      }}
                    >
                      {entry.label}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** A line's colors: a swatch named by its color, the bar of a scale, or the swatches of a field rule's first values. */
function LineColors({ line }: { readonly line: RuleLine }): React.JSX.Element | null {
  if (line.swatch !== undefined) {
    return (
      <span
        className={styles['swatch']}
        data-format={line.swatch.color}
        role="img"
        aria-label={line.swatch.name}
        title={line.swatch.name}
      />
    );
  }
  if (line.bar !== undefined) {
    return (
      <span
        className={styles['scale-bar']}
        data-format={line.bar.from ?? line.bar.to}
        data-format-toward={line.bar.to}
        data-faint={line.bar.from === undefined}
        role="img"
        aria-label={line.bar.label}
        title={line.bar.label}
      />
    );
  }
  if (line.paints === undefined || line.paints.length === 0) {
    return null;
  }
  return (
    <span className={styles['paints']} aria-hidden="true">
      {line.paints.map((paint, index) => (
        <span
          key={String(index)}
          className={styles['swatch']}
          data-format={paint.color}
          data-format-outlined={paint.outlined === true ? true : undefined}
          style={
            paint.strength === undefined
              ? undefined
              : ({ '--format-share': `${String(Math.round(30 + 70 * paint.strength))}%` } as React.CSSProperties)
          }
        />
      ))}
    </span>
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
      data-absent={line.absent !== undefined}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(draggedRule, line.id);
        event.dataTransfer.effectAllowed = 'copyMove';
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(draggedRule)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDrop={(event) => {
        const dragged = event.dataTransfer.getData(draggedRule);
        if (dragged !== '') {
          event.preventDefault();
          event.stopPropagation();
          const box = event.currentTarget.getBoundingClientRect();
          props.onDrop(dragged, event.clientY > box.top + box.height / 2);
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
      <LineColors line={line} />
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
        {line.absent === undefined ? null : <span className={styles['spoken']}>{line.absent}</span>}
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
