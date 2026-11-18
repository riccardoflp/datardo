/**
 * Datardo's own window's buttons, on Linux: **Minimize**, **Maximize** or **Restore**, **Close**; in full screen, only
 * **Exit full screen** (`window.frame`, `window.top-bar`).
 */
import type { WindowButton } from '../../../features/window/top-bar';
import { startIntent } from './start';
import styles from './top-bar.module.css';

const icons: Readonly<Record<WindowButton['icon'], string>> = {
  minimize: 'codicon-chrome-minimize',
  maximize: 'codicon-chrome-maximize',
  restore: 'codicon-chrome-restore',
  close: 'codicon-chrome-close',
  'exit-full-screen': 'codicon-screen-normal',
};

/** The buttons, at the right end of the top bar. */
export function WindowButtons({ buttons }: { readonly buttons: readonly WindowButton[] }): React.JSX.Element | null {
  if (buttons.length === 0) {
    return null;
  }
  return (
    <div className={styles['windowButtons']}>
      {buttons.map((button) => (
        <button
          key={button.name}
          type="button"
          className={`${styles['windowButton'] ?? ''} ${button.icon === 'close' ? (styles['closeButton'] ?? '') : ''}`}
          aria-label={button.name}
          title={button.name}
          data-feature={button.element}
          onClick={() => {
            startIntent(button.intent);
          }}
        >
          <span className={`codicon ${icons[button.icon]}`} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
