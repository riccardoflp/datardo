/**
 * One tab of the strip (`tab.strip`): its icon, its title cut with `…` when it is narrower, and its close button, or
 * the dot of its unsaved changes in its place. A click makes it active, a click with the middle button closes it.
 */
import type { StripTab as StripTabView } from '../../../features/tab/strip';
import { text } from '../../../features/tab/text';
import styles from './tab-strip.module.css';

/** What a tab does when it is used. */
export interface TabHandlers {
  readonly activate: () => void;
  readonly close: () => void;
  readonly pointerDown: (event: React.PointerEvent) => void;
  readonly keyDown: (event: React.KeyboardEvent) => void;
}

/** The icon, the title and the close button, as the strip draws them and as they are measured. */
export function TabContent({
  tab,
  onClose,
}: {
  readonly tab: StripTabView;
  readonly onClose?: () => void;
}): React.JSX.Element {
  return (
    <>
      <span className={`codicon codicon-${tab.icon} ${styles['icon'] ?? ''}`} aria-hidden="true" />
      <span className={styles['tab-title']}>{tab.title}</span>
      {tab.closable ? (
        <span
          className={styles['close']}
          data-unsaved={tab.unsaved ? true : undefined}
          data-feature="tab.close@tab-strip"
          aria-hidden="true"
          title={text.strip.close(tab.title)}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onClose?.();
          }}
        >
          <span className={styles['unsaved-dot']} />
          <span className={`codicon codicon-close ${styles['close-icon'] ?? ''}`} />
        </span>
      ) : null}
    </>
  );
}

/** A tab of the strip, at the width `tab.fit` gave it. */
export function StripTab({
  tab,
  width,
  shift,
  dragging,
  focusable,
  handlers,
  ...trigger
}: {
  readonly tab: StripTabView;
  readonly width: number | undefined;
  readonly shift: number;
  readonly dragging: boolean;
  readonly focusable: boolean;
  readonly handlers: TabHandlers;
} & React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      {...trigger}
      role="tab"
      className={styles['tab']}
      data-tab-id={tab.id}
      data-feature="tab.activate@tab-strip"
      data-reorder="tab.reorder@tab-strip"
      data-dragging={dragging ? true : undefined}
      aria-selected={tab.active}
      aria-label={tab.spoken}
      title={tab.path}
      tabIndex={focusable ? 0 : -1}
      style={{
        ...(width === undefined ? {} : { width }),
        ...(shift === 0 ? {} : { transform: `translateX(${String(shift)}px)` }),
      }}
      onClick={handlers.activate}
      onPointerDown={(event) => {
        trigger.onPointerDown?.(event);
        handlers.pointerDown(event);
      }}
      onMouseDown={(event) => {
        if (event.button === 1) {
          event.preventDefault();
        }
      }}
      onAuxClick={(event) => {
        if (event.button === 1 && tab.closable) {
          event.preventDefault();
          handlers.close();
        }
      }}
      onKeyDown={handlers.keyDown}
    >
      <TabContent tab={tab} onClose={handlers.close} />
    </div>
  );
}
