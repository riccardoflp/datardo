/**
 * `nav.rail`: the column of icons at the left edge, on the window's background. `Up` and `Down` move between its
 * entries; `Enter` or `Space` starts the one focused.
 */
import * as Tooltip from '@radix-ui/react-tooltip';
import { useRef, useState, type KeyboardEvent } from 'react';
import { view, type RailEntry } from '../../features/nav/rail';
import type { NavInput } from '../../features/nav/types';
import { startFeature } from './intent';
import styles from './rail.module.css';

function RailButton(props: {
  readonly entry: RailEntry;
  readonly focusable: boolean;
  readonly onFocus: () => void;
  readonly first: boolean;
}): React.JSX.Element {
  const { entry } = props;
  const page = entry.name !== 'explorer' && entry.name !== 'search';
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className={styles['entry']}
          data-feature={entry.element}
          data-marked={entry.marked ? 'true' : undefined}
          {...(props.first ? { 'data-focus-first': true } : {})}
          aria-label={entry.label}
          aria-disabled={entry.disabled ? true : undefined}
          {...(entry.name === 'explorer' ? { 'aria-pressed': entry.marked } : {})}
          {...(page && entry.marked ? { 'aria-current': 'page' as const } : {})}
          tabIndex={props.focusable ? 0 : -1}
          onFocus={props.onFocus}
          onClick={() => {
            if (!entry.disabled) {
              startFeature(entry.feature, { place: 'rail', ...(entry.args === undefined ? {} : { args: entry.args }) });
            }
          }}
        >
          <span className={`codicon codicon-${entry.icon}`} aria-hidden="true" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className={styles['tooltip']} side="right" sideOffset={6}>
          {entry.tooltip}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** The rail. */
export function Rail({ input }: { readonly input: NavInput }): React.JSX.Element {
  const rail = view(input);
  const [focused, setFocused] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const move = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const next = (focused + step + rail.entries.length) % rail.entries.length;
    setFocused(next);
    list.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  };
  const button = (entry: RailEntry): React.JSX.Element => {
    const index = rail.entries.indexOf(entry);
    return (
      <RailButton
        key={entry.name}
        entry={entry}
        first={index === 0}
        focusable={index === focused}
        onFocus={() => {
          setFocused(index);
        }}
      />
    );
  };
  return (
    <nav
      className={styles['rail']}
      aria-label={rail.label}
      data-island="rail"
      data-feature="nav.rail@rail"
      tabIndex={-1}
    >
      <div ref={list} className={styles['entries']} role="toolbar" aria-orientation="vertical" onKeyDown={move}>
        <div className={styles['top']}>{rail.entries.filter((entry) => entry.position === 'top').map(button)}</div>
        <div className={styles['bottom']}>
          {rail.entries.filter((entry) => entry.position === 'bottom').map(button)}
        </div>
      </div>
    </nav>
  );
}
