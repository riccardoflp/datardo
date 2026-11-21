/**
 * The window of Datardo: the shell of islands (product.md, "The window"). Each part is drawn by `src/ui/shell` from
 * the app's state: the top bar (M1); the rail, the explorer, the main island, the inspector island and the status
 * line (M2); the runner's dialogs and notifications (M3); the tab strip comes in M4.
 */
import { TopBar } from './shell/top-bar';
import { Islands } from './shell/islands';
import { InlineEditor } from './pages/document/inline-editor';
import { RunnerLayer } from './runner/runner-layer';
import styles from './app.module.css';

/** The whole window. */
export function App(): React.JSX.Element {
  return (
    <div className={styles['app']}>
      <TopBar />
      <Islands />
      <InlineEditor />
      <RunnerLayer />
    </div>
  );
}
