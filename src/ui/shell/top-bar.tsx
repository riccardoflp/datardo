/**
 * `window.top-bar`: the strip at the top of the window, drawn from what `src/features/window/top-bar.ts` returns:
 * Datardo's icon and name, the **Go to** field (`palette.open`), the MCP state (`mcp.status`: its dot, and its tooltip
 * as the name) and, on Linux, the window's buttons. Its empty part drags
 * the window. It also names the window for the system (`window.title`), takes the window area's keys, and holds About.
 */
import '@vscode/codicons/dist/codicon.css';
import { useEffect } from 'react';
import { windowTitle } from '../../features/window/title';
import { view } from '../../features/window/top-bar';
import { GoTo } from '../palette/go-to';
import { AboutDialog } from '../window/about';
import { useAppState } from '../state/store';
import { AppIcon } from './top-bar/app-icon';
import { startIntent } from './top-bar/start';
import { WindowButtons } from './top-bar/window-buttons';
import { useWindowKeys } from './top-bar/window-keys';
import styles from './top-bar/top-bar.module.css';

/** The top bar. */
export function TopBar(): React.JSX.Element {
  const state = useAppState();
  const bar = view(state);
  useWindowKeys(state.app.platform);
  // The active tab names the window once tabs exist (M4); until then no tab is active.
  const title = windowTitle(undefined);
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <header className={styles['bar']} style={{ paddingLeft: bar.room.left, paddingRight: bar.room.right }}>
      <div className={styles['start']}>
        <AppIcon />
        <span className={styles['name']}>{bar.name}</span>
      </div>
      <div className={styles['center']}>
        <GoTo
          field={bar.goTo}
          classes={{
            field: styles['goTo'],
            button: styles['goToButton'],
            placeholder: styles['placeholder'],
            key: styles['key'],
          }}
        />
      </div>
      <div className={styles['end']}>
        <button
          type="button"
          className={styles['mcp']}
          aria-label={bar.mcp.label}
          title={bar.mcp.label}
          data-feature={bar.mcp.element}
          disabled={!bar.mcp.enabled}
          onClick={() => {
            startIntent(bar.mcp.intent);
          }}
        >
          {bar.mcp.text}
          <span
            className={styles['dot']}
            data-dot={bar.mcp.dot}
            data-feature={bar.mcp.stateElement}
            aria-hidden="true"
          />
        </button>
        <WindowButtons buttons={bar.buttons} />
      </div>
      <AboutDialog />
    </header>
  );
}
