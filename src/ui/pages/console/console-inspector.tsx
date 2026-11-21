/**
 * The string of a reply selected in the output of a console, in the inspector island (`console.output`,
 * `nav.inspector`): shown through `value.format` (as text, as formatted JSON when it parses, in hexadecimal when it is
 * not valid UTF-8), with its size in bytes and **Copy** (`console.copy-reply@inspector`).
 */
import { sizeText } from '../../../features/console/output';
import { text } from '../../../features/console/text';
import { shown as formatted } from '../../../features/value/format';
import { useAppState } from '../../state/store';
import { startFeature } from '../../shell/intent';
import { consoleTarget } from './console-actions';
import { selectedBytes } from './console-state';
import { useConsoleTab } from './console-store';
import styles from './console-page.module.css';

/** The value selected in the output of the console tab. */
export function ConsoleInspector({ tabId }: { readonly tabId: string }): React.JSX.Element | null {
  const app = useAppState();
  const tab = useConsoleTab(tabId);
  const console = tab === undefined ? undefined : app.consoles[tab.connection];
  const bytes = tab === undefined || console === undefined ? undefined : selectedBytes(console, tab);
  if (tab === undefined || bytes === undefined || tab.selected === undefined) {
    return null;
  }
  const value = formatted(bytes, undefined, 'full');
  const selected = tab.selected;
  return (
    <div className={styles['inspected']}>
      <div className={styles['inspected-bar']}>
        <span>{sizeText(bytes.length)}</span>
        <button
          type="button"
          className={styles['button']}
          data-feature="console.copy-reply@inspector"
          onClick={() => {
            startFeature('console.copy-reply', {
              place: 'inspector',
              target: consoleTarget(tab.connection),
              args: { variant: 'value', entry: selected.entry, line: selected.line, string: selected.string },
            });
          }}
        >
          {text.copy.title}
        </button>
      </div>
      {value.note === undefined ? null : <p className={styles['note']}>{value.note}</p>}
      <pre className={styles['value']}>{value.text}</pre>
    </div>
  );
}
