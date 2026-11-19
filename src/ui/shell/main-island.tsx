/**
 * The main island: the tab strip (`tab.strip`), the scope bar (`nav.scope-bar`, `nav.path`, `nav.back`,
 * `nav.copy-path`, `nav.pin`, `nav.open-on-another-connection`) and the page of the active tab. With no tab open it
 * stands for Home, which M5 brings.
 */
import { shortenedPath, type PathSegment } from '../../features/nav/path';
import { view as scopeBarView, type ScopeButton } from '../../features/nav/scope-bar';
import { pageTitle, text } from '../../features/nav/text';
import type { NavInput } from '../../features/nav/types';
import { useLayoutEffect, useRef, useState } from 'react';
import { pages } from '../pages';
import { CollectionPage } from '../pages/collection/collection-page';
import { startFeature } from './intent';
import { TabStrip } from './tab-strip';
import styles from './bars.module.css';

function BarButton({
  button,
  iconOnly,
}: {
  readonly button: ScopeButton;
  readonly iconOnly: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={styles['bar-button']}
      data-feature={button.element}
      aria-label={button.label}
      aria-disabled={button.disabled === true ? true : undefined}
      title={button.tooltip ?? button.label}
      onClick={() => {
        if (button.disabled !== true) {
          startFeature(button.feature, {
            place: 'scope-bar',
            ...(button.args === undefined ? {} : { args: button.args }),
          });
        }
      }}
    >
      <span className={`codicon codicon-${button.icon}`} aria-hidden="true" />
      {iconOnly ? null : <span>{button.label}</span>}
    </button>
  );
}

function Segment({
  segment,
  openSwitcher,
}: {
  readonly segment: PathSegment;
  readonly openSwitcher: () => void;
}): React.JSX.Element {
  const icon = segment.view === true ? <span className="codicon codicon-eye" aria-hidden="true" /> : null;
  if (segment.menu === 'connection') {
    return (
      <button
        type="button"
        className={styles['segment']}
        data-feature="nav.switch-connection@scope-bar"
        onClick={openSwitcher}
      >
        {segment.label}
      </button>
    );
  }
  return (
    <span className={styles['segment-text']}>
      {icon}
      {segment.label}
    </span>
  );
}

function ScopeBar({
  input,
  openSwitcher,
}: {
  readonly input: NavInput;
  readonly openSwitcher: () => void;
}): React.JSX.Element {
  const bar = scopeBarView(input);
  const row = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const element = row.current;
    if (element === null) {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      setNarrow(element.clientWidth < 560);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  const { shown, hidden } = narrow ? shortenedPath(bar.path.segments) : { shown: bar.path.segments, hidden: [] };
  const right = [bar.copyPath, bar.pin, bar.openOnAnother].filter((button) => button !== undefined);
  return (
    <div
      ref={row}
      className={styles['scope-bar']}
      role="toolbar"
      aria-label={bar.label}
      data-feature="nav.scope-bar@scope-bar"
    >
      <BarButton button={bar.back} iconOnly />
      <BarButton button={bar.forward} iconOnly />
      <nav className={styles['path']} aria-label={bar.path.label} data-feature="nav.path@scope-bar">
        {shown.map((segment, index) => (
          <span key={`${segment.label} ${String(index)}`} className={styles['segment-wrap']}>
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {index === 1 && hidden.length > 0 ? (
              <>
                <span className={styles['segment-text']} title={hidden.map((each) => each.label).join(' / ')}>
                  …
                </span>
                <span aria-hidden="true">/</span>
              </>
            ) : null}
            <Segment segment={segment} openSwitcher={openSwitcher} />
          </span>
        ))}
      </nav>
      <div className={styles['right']}>
        {right.map((button) => (
          <BarButton key={button.element} button={button} iconOnly={narrow} />
        ))}
      </div>
    </div>
  );
}

/** The main island, as wide as the layout leaves it. */
export function MainIsland({
  input,
  openSwitcher,
}: {
  readonly input: NavInput;
  readonly openSwitcher: () => void;
}): React.JSX.Element {
  const shown = input.activeTab;
  const page = shown.kind === 'app' || shown.kind === 'page' ? shown.page : shown.kind;
  const Page = shown.kind === 'app' || shown.kind === 'page' ? pages[shown.page] : undefined;
  return (
    <section className={styles['main-island']} aria-label={text.islands.mainIsland} data-island="main" tabIndex={-1}>
      <TabStrip />
      <ScopeBar input={input} openSwitcher={openSwitcher} />
      <div
        className={styles['page']}
        data-page={page}
        data-focus-first
        tabIndex={-1}
        aria-label={pageTitle(page)}
        role="region"
      >
        {Page !== undefined ? (
          <Page />
        ) : shown.kind === 'collection' && shown.tab !== undefined ? (
          <CollectionPage key={shown.tab} tab={shown.tab} shows={shown} />
        ) : null}
      </div>
    </section>
  );
}
