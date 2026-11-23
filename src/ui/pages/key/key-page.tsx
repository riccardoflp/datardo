/**
 * The page of a key tab (`key.open`): the key's details as `key.inspect` shows them, read when the tab is shown and
 * after every refresh of its connection, with the toolbar of what can be done to it (`key.rename`, `key.copy`,
 * `key.set-expiry`, `key.persist`, `key.copy-name`, `key.delete`). On a read-only connection only **Copy name** is
 * there, with **Refresh** (`value.refresh`). Under the key's lines, its value is shown by `value.show`. The last read
 * of each tab stays on screen while the next one is made, and **Make persistent** keeps its place, hidden, while the
 * key has no expiry, so that nothing moves.
 */
import { useEffect, useState } from 'react';
import { view, type InspectRead, type InspectedKey } from '../../../features/key/inspect';
import { text } from '../../../features/key/text';
import { bytesOfHex, hexOf, nameOfText, type KeyName } from '../../../features/key/types';
import { featureId } from '../../../shared/ids';
import { activeTabOf, type TabShows } from '../../../shared/state/tabs';
import type { Target } from '../../../shared/target';
import { startFeature } from '../../shell/intent';
import { useAppState } from '../../state/store';
import { KeyDetails, useClock } from '../keys/key-inspector';
import { factsOf } from '../keys/keys-state';
import styles from '../keys/keys-page.module.css';
import { refreshValue } from '../value/value-actions';
import { ValueSection } from '../value/value-page';
import { forgetClosedValues } from '../value/value-store';

type KeyShows = Extract<TabShows, { kind: 'key' }>;

/** A button of the toolbar of a key tab: its text, its identifier and its feature; hidden, it keeps its place. */
interface ToolbarEntry {
  readonly label: string;
  readonly element: string;
  readonly feature: string;
  readonly hidden?: boolean;
}

/**
 * The toolbar: the writes, then **Copy name**; only **Copy name** on a read-only connection. **Make persistent** is
 * offered on a key with an expiry, and otherwise hidden in its place.
 */
function toolbarOf(readOnly: boolean, hasExpiry: boolean): readonly ToolbarEntry[] {
  const menu = text.show.menu;
  const copyName = { label: menu.copyName, element: 'key.copy-name@toolbar', feature: 'key.copy-name' };
  if (readOnly) {
    return [copyName];
  }
  return [
    { label: menu.rename, element: 'key.rename@toolbar', feature: 'key.rename' },
    { label: menu.copy, element: 'key.copy@toolbar', feature: 'key.copy' },
    { label: menu.setExpiry, element: 'key.set-expiry@toolbar', feature: 'key.set-expiry' },
    { label: menu.persist, element: 'key.persist@toolbar', feature: 'key.persist', hidden: !hasExpiry },
    copyName,
    { label: menu.delete, element: 'key.delete@toolbar', feature: 'key.delete' },
  ];
}

function nameOf(shows: KeyShows): KeyName {
  return (shows.keyHex === undefined ? undefined : bytesOfHex(shows.keyHex)) ?? nameOfText(shows.key);
}

/** The last read of each key tab, by the tab's id: shown again at once when the tab is, until it is read again. */
const lastReads = new Map<string, InspectRead>();

/** Reads the key when the tab is shown and after every refresh of its connection. */
function useKeyRead(tabId: string, shows: KeyShows, keyHex: string, refreshed: number): InspectRead {
  const [read, setRead] = useState<InspectRead>(() => lastReads.get(tabId) ?? { kind: 'loading' });
  useEffect(() => {
    let current = true;
    void window.datardo
      .start({
        feature: featureId('key.inspect:read'),
        target: { kind: 'redis-database', connection: shows.connection, database: shows.database },
        args: { connection: shows.connection, database: shows.database, key: keyHex },
      })
      .then((result) => {
        if (!current) {
          return;
        }
        const key = result.kind === 'read' ? (result.result as InspectedKey | 'gone') : undefined;
        const answer: InspectRead =
          key === undefined
            ? { kind: 'failed', error: result.kind === 'failed' || result.kind === 'refused' ? result.message : '' }
            : key === 'gone'
              ? { kind: 'gone' }
              : { kind: 'loaded', key, readAt: Date.now() };
        lastReads.set(tabId, answer);
        setRead(answer);
      });
    return () => {
      current = false;
    };
  }, [tabId, shows.connection, shows.database, keyHex, refreshed]);
  return read;
}

function KeyTabPage({ tabId, shows }: { readonly tabId: string; readonly shows: KeyShows }): React.JSX.Element {
  const app = useAppState();
  const now = useClock();
  const name = nameOf(shows);
  const read = useKeyRead(tabId, shows, hexOf(name), app.runner.refreshed.times);
  const facts = factsOf(app, shows.connection);
  const shown = view({ name, readOnly: facts.readOnly, read, now });
  const target: Target = { kind: 'key', connection: shows.connection, database: shows.database, key: name };
  const hasExpiry = read.kind === 'loaded' && read.key.timeLeft !== null;
  const keyHex = hexOf(name);
  return (
    <div className={styles['page']}>
      <div className={styles['toolbar']} role="toolbar" aria-label={shown.name}>
        {toolbarOf(facts.readOnly, hasExpiry).map((entry) => (
          <button
            key={entry.element}
            type="button"
            className={styles['button']}
            data-feature={entry.element}
            {...(entry.hidden === true ? { disabled: true, style: { visibility: 'hidden' as const } } : {})}
            onClick={() => {
              startFeature(entry.feature, { place: 'toolbar', target });
            }}
          >
            {entry.label}
          </button>
        ))}
        <button
          type="button"
          className={styles['button']}
          data-feature="value.refresh@toolbar"
          aria-keyshortcuts="F5"
          title="F5"
          onClick={() => void refreshValue(tabId)}
        >
          Refresh
        </button>
      </div>
      <KeyDetails shown={shown} target={target} place="toolbar" buttons={false} />
      <ValueSection tabId={tabId} at={{ connection: shows.connection, database: shows.database, keyHex }} app={app} />
    </div>
  );
}

/** The page of the active key tab. */
export function KeyPage(): React.JSX.Element | null {
  const tabs = useAppState().tabs;
  const active = activeTabOf(tabs);
  useEffect(() => {
    const open: ReadonlySet<string> = new Set(tabs.tabs.map((tab) => tab.id));
    forgetClosedValues(open);
    for (const tab of [...lastReads.keys()]) {
      if (!open.has(tab)) {
        lastReads.delete(tab);
      }
    }
  }, [tabs.tabs]);
  if (active?.shows.kind !== 'key') {
    return null;
  }
  return <KeyTabPage key={active.id} tabId={active.id} shows={active.shows} />;
}
