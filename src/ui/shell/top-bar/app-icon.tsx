/**
 * Datardo's icon: a ring in the accent color, as the tray draws it.
 */
import styles from './top-bar.module.css';

/** Datardo's icon, which a screen reader skips: the name beside it says what it is. */
export function AppIcon({ large = false }: { readonly large?: boolean }): React.JSX.Element {
  return (
    <svg
      className={large ? styles['appIconLarge'] : styles['appIcon']}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="5.75" fill="none" stroke="currentColor" strokeWidth="4" />
    </svg>
  );
}
