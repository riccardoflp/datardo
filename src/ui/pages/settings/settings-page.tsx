/**
 * `settings.page`: every setting by group, with a filter, the list of the groups at the left (`@list`), **Reset all
 * settings…** (`settings.reset@toolbar`), and **About Datardo** and **Open data folder** at the bottom. Opened at a
 * group, it scrolls to it and puts the focus on its first control.
 */
import { useEffect, useRef, useState } from 'react';
import { view, type SettingGroup } from '../../../features/settings/page';
import { settingsText } from '../../../features/settings/text';
import { startFeature } from '../../shell/intent';
import { useAppState } from '../../state/store';
import { openAbout } from '../../window/about';
import { SettingRow } from './setting-row';
import styles from './settings-page.module.css';

/** The element of a group, by its title. */
function groupElement(root: HTMLElement | null, group: string): HTMLElement | undefined {
  return [...(root?.querySelectorAll<HTMLElement>('[data-group]') ?? [])].find(
    (element) => element.dataset['group'] === group,
  );
}

/** Scrolls to a group and puts the focus on its first control. */
function showGroup(root: HTMLElement | null, group: string): void {
  const element = groupElement(root, group);
  element?.scrollIntoView({ block: 'start' });
  element?.querySelector<HTMLElement>('input, select, button[role="switch"]')?.focus();
}

function Group({ group, disabled }: { readonly group: SettingGroup; readonly disabled: boolean }): React.JSX.Element {
  return (
    <section className={styles['group']} data-group={group.title} aria-label={group.title}>
      <h2 className={styles['groupTitle']}>{group.title}</h2>
      {group.rows.map((row) => (
        <SettingRow key={row.name} row={row} disabled={disabled} />
      ))}
    </section>
  );
}

/** The Settings page. */
export function SettingsPage(): React.JSX.Element {
  const state = useAppState();
  const [filter, setFilter] = useState('');
  const content = useRef<HTMLDivElement>(null);
  const page = view({ settings: state.settings, filter });
  const opened = state.runner.opened;
  const asked = opened?.page === 'settings' ? opened.at : undefined;
  const request = `${String(opened?.times ?? 0)} ${asked ?? ''}`;
  const [seen, setSeen] = useState<string | undefined>(undefined);
  if (seen !== request) {
    // A new request for a group: the filter is cleared, so that the group shows.
    setSeen(request);
    if (asked !== undefined) {
      setFilter('');
    }
  }
  useEffect(() => {
    if (asked !== undefined) {
      requestAnimationFrame(() => {
        showGroup(content.current, asked);
      });
    }
  }, [asked, opened?.times]);
  return (
    <div className={styles['page']}>
      <nav className={styles['list']} aria-label={settingsText.groups}>
        {page.groupList.map((group) => (
          <button
            key={group}
            type="button"
            className={styles['groupLink']}
            onClick={() => {
              showGroup(content.current, group);
            }}
          >
            {group}
          </button>
        ))}
      </nav>
      <div ref={content} className={styles['content']}>
        <h1 className={styles['pageTitle']}>{settingsText.title}</h1>
        {page.newerVersion === undefined ? null : (
          <p className={styles['newer']} role="status">
            {page.newerVersion}
          </p>
        )}
        <div className={styles['toolbar']}>
          <input
            className={styles['input']}
            type="search"
            value={filter}
            placeholder={settingsText.filter}
            aria-label={settingsText.filter}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
          />
          <button
            type="button"
            className={styles['button']}
            data-feature="settings.reset@toolbar"
            disabled={!page.canResetAll}
            onClick={() => {
              startFeature('settings.reset', { place: 'toolbar' });
            }}
          >
            {settingsText.resetAll}
          </button>
        </div>
        {page.empty === undefined ? null : (
          <div className={styles['empty']}>
            <p>{page.empty}</p>
            <button
              type="button"
              className={styles['button']}
              onClick={() => {
                setFilter('');
              }}
            >
              {settingsText.clearFilter}
            </button>
          </div>
        )}
        {page.groups.map((group) => (
          <Group key={group.title} group={group} disabled={page.disabled} />
        ))}
        <div className={styles['bottom']}>
          <button type="button" className={styles['button']} onClick={openAbout}>
            {settingsText.aboutDatardo}
          </button>
          <button
            type="button"
            className={styles['button']}
            onClick={() => {
              startFeature('window.open-data-folder');
            }}
          >
            {settingsText.openDataFolder}
          </button>
        </div>
      </div>
    </div>
  );
}
