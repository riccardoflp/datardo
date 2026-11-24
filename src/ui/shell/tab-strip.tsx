/**
 * `tab.strip`: the open tabs in groups, in the first row of the main island. Draws what `tab.strip`'s View returns,
 * the widths `tab.fit` decides, the drag of `tab.reorder` and the menus of `tab.menu`; every control sends its intent.
 * With the focus on the strip, `Left` and `Right` move between the tabs that are shown, `Home` and `End` go to the
 * first and the last, `Enter` or `Space` makes the focused one active, `Delete` closes it.
 */
import { useEffect, useRef, useState } from 'react';
import { labelMenu, view as menuView } from '../../features/tab/menu';
import { view as stripView, type StripGroup, type StripTab as StripTabView } from '../../features/tab/strip';
import { text } from '../../features/tab/text';
import { connectionId, type TabId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { useAppState } from '../state/store';
import { startFeature } from './intent';
import { StripMenu } from './tab-strip/strip-menu';
import { StripTab, TabContent } from './tab-strip/strip-tab';
import { useTabDrag } from './tab-strip/use-drag';
import { useFit } from './tab-strip/use-fit';
import { openGoTo } from '../palette/go-to-store';
import styles from './tab-strip/tab-strip.module.css';
import { colorAttributes } from '../components/color';

/** What the tabs of the strip share: the state, the widths, the drag and the focus. */
interface StripContext {
  readonly state: AppState;
  readonly shown: readonly StripTabView[];
  readonly widths: ReadonlyMap<string, number>;
  readonly drag: ReturnType<typeof useTabDrag>;
  readonly focusable: TabId | undefined;
  readonly setFocused: (tab: TabId) => void;
  readonly scroller: React.RefObject<HTMLDivElement | null>;
}

function focusTab(scroller: HTMLElement | null, tab: TabId | undefined): void {
  if (tab !== undefined) {
    scroller?.querySelector<HTMLElement>(`[data-tab-id="${tab}"]`)?.focus();
  }
}

function activate(tab: TabId, keepFocus: boolean): void {
  startFeature('tab.activate', { place: 'tab-strip', args: { tab } });
  if (!keepFocus) {
    document.querySelector<HTMLElement>('[data-island="main"] [data-page]')?.focus();
  }
}

function close(tab: TabId): void {
  startFeature('tab.close', { place: 'tab-strip', args: { tab } });
}

/** The keys of a tab with the focus on the strip. */
function keyDown(context: StripContext, tab: StripTabView, event: React.KeyboardEvent): void {
  const index = context.shown.findIndex((each) => each.id === tab.id);
  const moves: Readonly<Record<string, number>> = {
    ArrowRight: Math.min(index + 1, context.shown.length - 1),
    ArrowLeft: Math.max(index - 1, 0),
    Home: 0,
    End: context.shown.length - 1,
  };
  const to = moves[event.key];
  if (to !== undefined) {
    event.preventDefault();
    const target = context.shown[to]?.id;
    if (target !== undefined) {
      context.setFocused(target);
      focusTab(context.scroller.current, target);
    }
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    activate(tab.id, true);
  } else if (event.key === 'Delete' && tab.closable) {
    event.preventDefault();
    close(tab.id);
  }
}

function GroupTabs({
  group,
  context,
}: {
  readonly group: StripGroup;
  readonly context: StripContext;
}): React.JSX.Element {
  const ids = group.tabs.map((tab) => tab.id);
  return (
    <div role="tablist" aria-label={group.label?.fullName ?? text.strip.label} className={styles['tabs']}>
      {group.tabs.map((tab) => (
        <StripMenu key={tab.id} entries={() => menuView(context.state, tab.id)} label={text.menu.label(tab.title)}>
          <StripTab
            tab={tab}
            width={context.widths.get(tab.id)}
            shift={context.drag.offsetOf(tab.id)}
            dragging={context.drag.dragging === tab.id}
            focusable={context.focusable === tab.id}
            handlers={{
              activate: () => {
                if (!context.drag.wasDrag()) {
                  activate(tab.id, false);
                }
              },
              close: () => {
                close(tab.id);
              },
              pointerDown: (event) => {
                context.drag.start(event, tab.id, ids);
              },
              keyDown: (event) => {
                keyDown(context, tab, event);
              },
            }}
            onFocus={() => {
              context.setFocused(tab.id);
            }}
          />
        </StripMenu>
      ))}
    </div>
  );
}

function Group({ group, context }: { readonly group: StripGroup; readonly context: StripContext }): React.JSX.Element {
  const { label, connection } = group;
  return (
    <div className={styles['group']} data-group {...colorAttributes(label?.color)}>
      {label === undefined || connection === undefined ? null : (
        <StripMenu
          entries={() => labelMenu(context.state, connectionId(connection))}
          label={text.menu.label(label.fullName)}
        >
          <button
            type="button"
            className={styles['label']}
            data-group-label
            data-current={label.current ? true : undefined}
            data-feature="tab.collapse-group@tab-strip"
            aria-expanded={!group.collapsed}
            aria-label={label.spoken}
            title={label.fullName}
            onClick={() => {
              startFeature('tab.collapse-group', { place: 'tab-strip', args: { connection } });
            }}
          >
            <span className={styles['dot']} data-dot={label.dot} aria-hidden="true" />
            <span>{label.name}</span>
            {group.collapsed ? <span className={styles['count']}>{group.count}</span> : null}
          </button>
        </StripMenu>
      )}
      {group.tabs.length > 0 ? <GroupTabs group={group} context={context} /> : null}
    </div>
  );
}

/** Keeps the active tab in sight, and says at which edges tabs are hidden. */
function useSight(
  scroller: React.RefObject<HTMLDivElement | null>,
  active: TabId | undefined,
): {
  readonly start: boolean;
  readonly end: boolean;
  readonly measure: () => void;
} {
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = (): void => {
    const element = scroller.current;
    if (element !== null) {
      const start = element.scrollLeft > 0;
      const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      setEdges((before) => (before.start === start && before.end === end ? before : { start, end }));
    }
  };
  useEffect(() => {
    if (active !== undefined) {
      scroller.current
        ?.querySelector(`[data-tab-id="${active}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    const frame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(frame);
    };
  });
  return { ...edges, measure };
}

/** The tab strip. */
export function TabStrip(): React.JSX.Element {
  const state = useAppState();
  const view = stripView(state);
  const strip = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const measureLayer = useRef<HTMLDivElement>(null);
  const shown = view.groups.flatMap((group) => group.tabs);
  const shape = `${view.groups.map((group) => `${group.label?.name ?? ''}#${String(group.collapsed)}`).join('|')}/${shown.map((tab) => `${tab.id}:${tab.title}:${String(tab.closable)}`).join('|')}`;
  const fitted = useFit(strip, scroller, measureLayer, shape);
  const drag = useTabDrag(scroller);
  const [focused, setFocused] = useState<TabId | undefined>(undefined);
  const sight = useSight(scroller, state.tabs.active);
  const inStrip = shown.find((tab) => tab.id === focused) ?? shown.find((tab) => tab.active) ?? shown[0];
  const context: StripContext = {
    state,
    shown,
    widths: fitted.widths,
    drag,
    focusable: inStrip?.id,
    setFocused,
    scroller,
  };
  return (
    <div ref={strip} className={styles['strip']} data-feature="tab.strip@tab-strip">
      <div
        ref={scroller}
        className={styles['scroller']}
        data-hidden-start={sight.start ? true : undefined}
        data-hidden-end={sight.end ? true : undefined}
        onScroll={sight.measure}
        onWheel={(event) => {
          const element = scroller.current;
          if (!event.ctrlKey && !event.metaKey && element !== null && element.scrollWidth > element.clientWidth) {
            element.scrollLeft += event.deltaY === 0 ? event.deltaX : event.deltaY;
          }
        }}
      >
        {view.groups.map((group) => (
          <Group key={group.connection ?? 'app'} group={group} context={context} />
        ))}
      </div>
      {fitted.scrolls ? (
        <button
          type="button"
          className={styles['all-tabs']}
          aria-label={view.allTabs.label}
          title={view.allTabs.label}
          data-feature="palette.open@tab-strip"
          onClick={() => {
            openGoTo(view.allTabs.prefix);
          }}
        >
          <span className="codicon codicon-chevron-down" aria-hidden="true" />
        </button>
      ) : null}
      <div ref={measureLayer} className={styles['measure']} aria-hidden="true">
        {shown.map((tab) => (
          <div key={tab.id} className={styles['tab']} data-measure-id={tab.id}>
            <TabContent tab={tab} />
          </div>
        ))}
      </div>
    </div>
  );
}
