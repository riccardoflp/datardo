/**
 * `nav.inspector`: the island at the right of the main island, for the thing selected in the page. What one selected
 * thing looks like is drawn by the page's feature (`document.inspect`, `key.inspect`), which M12 and M13 bring.
 */
import { useEffect, useState } from 'react';
import { view } from '../../features/nav/inspector';
import { text } from '../../features/nav/text';
import type { NavInput } from '../../features/nav/types';
import { extrasKey, inspectors } from '../pages';
import { startFeature } from './intent';
import styles from './bars.module.css';

function Loading({ delayMs, label }: { readonly delayMs: number; readonly label: string }): React.JSX.Element | null {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setShown(true);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [delayMs]);
  return shown ? (
    <span className="codicon codicon-loading codicon-modifier-spin" role="img" aria-label={label} />
  ) : null;
}

/** The one thing selected, as the page of the active tab draws it (`key.inspect`). */
function SelectedThing({ input }: { readonly input: NavInput }): React.JSX.Element | null {
  const tab = input.activeTab;
  const Drawn = inspectors[extrasKey(tab)];
  return Drawn === undefined || tab.tab === undefined ? null : <Drawn tabId={tab.tab} />;
}

/** The inspector island, when its View shows it; `width` is the layout's. */
export function Inspector({
  input,
  width,
}: {
  readonly input: NavInput;
  readonly width: number;
}): React.JSX.Element | null {
  const shown = view(input);
  if (shown.kind === 'not-shown') {
    return null;
  }
  const body = shown.body;
  return (
    <aside
      className={styles['inspector']}
      style={{ width }}
      aria-label={text.islands.inspector}
      data-island="inspector"
      data-feature="nav.inspector@inspector"
      tabIndex={-1}
    >
      <div className={styles['inspector-head']}>
        <span className={styles['cut']}>{shown.title}</span>
        <button
          type="button"
          className={styles['bar-button']}
          data-feature="nav.toggle-inspector@inspector"
          aria-label={shown.hide.label}
          title={shown.hide.label}
          onClick={() => {
            startFeature(shown.hide.feature, { place: 'inspector', args: { hidden: true } });
          }}
        >
          <span className="codicon codicon-layout-sidebar-right-off" aria-hidden="true" />
        </button>
      </div>
      {body.kind === 'nothing-selected' || body.kind === 'several' ? (
        <div className={styles['inspector-empty']}>
          <strong>{body.heading}</strong>
          <span>{body.line}</span>
        </div>
      ) : body.kind === 'loading' ? (
        <Loading delayMs={body.delayMs} label={body.label} />
      ) : body.kind === 'selected' ? (
        <SelectedThing input={input} />
      ) : (
        <div className={styles['inspector-empty']}>
          <span>{body.message}</span>
        </div>
      )}
    </aside>
  );
}
