/**
 * `console.show`: the page of a console tab, drawn from its View: the toolbar with the database menu, **Clear output**
 * and the notice, the output (`console.output`) and the input (`console.input`). The commands the server knows are read
 * once for each opening of the console's connection (`console.command-docs`).
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useEffect } from 'react';
import { builtinDocs } from '../../../features/console/command-docs';
import { view, type ConsoleView } from '../../../features/console/show';
import type { ConsoleState } from '../../../features/console/types';
import type { AppState } from '../../../shared/state';
import { savedConnection } from '../../../shared/state/connections';
import { activeTabOf, type TabShows } from '../../../shared/state/tabs';
import { useAppState } from '../../state/store';
import { useTree } from '../../tree/tree-store';
import { clearOutput, readDocs, runLine, versionOf } from './console-actions';
import { ConsoleInput } from './console-input';
import { ConsoleOutput } from './console-output';
import { databasesOf } from './console-state';
import { consoleTabOf, forgetClosed, freshTab, keepTab, useConsoleTab } from './console-store';
import styles from './console-page.module.css';

type ConsoleShows = Extract<TabShows, { kind: 'console' }>;

function Toolbar(props: {
  readonly tabId: string;
  readonly console: ConsoleState;
  readonly toolbar: ConsoleView['toolbar'];
}): React.JSX.Element {
  const { tabId, console, toolbar } = props;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={toolbar.database.label}>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={styles['button']}
            data-feature={toolbar.database.element}
            aria-label={`${toolbar.database.label}: ${toolbar.database.value}`}
          >
            {toolbar.database.value}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={styles['menu']} aria-label={toolbar.database.label} align="start">
            {toolbar.database.choices.map((choice) => (
              <DropdownMenu.Item
                key={choice.label}
                className={styles['menu-item']}
                onSelect={() => {
                  runLine(console.connection, choice.line, 'toolbar');
                }}
              >
                {choice.label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <button
        type="button"
        className={styles['button']}
        data-feature={toolbar.clear.element}
        onClick={() => {
          clearOutput(tabId, console.connection, 'toolbar');
        }}
      >
        {toolbar.clear.label}
      </button>
      <span className={styles['notice']}>{toolbar.notice}</span>
    </div>
  );
}

/** Reads the commands the server knows, once for each opening of the console's connection. */
function useDocs(tabId: string, console: ConsoleState | undefined, app: AppState): void {
  const opened = console?.opened ?? 0;
  const ready = console !== undefined && console.status !== 'connecting' && console.status !== 'closed';
  const version = console === undefined ? '' : versionOf(app, console.connection);
  useEffect(() => {
    const tab = consoleTabOf(tabId);
    if (tab === undefined || console === undefined || !ready || opened === 0 || tab.docs?.opened === opened) {
      return;
    }
    void readDocs(tabId, console.connection, opened, version);
  }, [tabId, console, ready, opened, version]);
}

function ConsoleTabPage(props: { readonly tabId: string; readonly shows: ConsoleShows; readonly app: AppState }) {
  const { tabId, shows, app } = props;
  useTree(shows.connection);
  useEffect(() => {
    if (consoleTabOf(tabId) === undefined) {
      keepTab(tabId, freshTab(shows.connection));
    }
  }, [tabId, shows.connection]);
  const tab = useConsoleTab(tabId);
  const console = app.consoles[shows.connection];
  useDocs(tabId, console, app);
  if (tab === undefined || console === undefined) {
    return null;
  }
  const readOnly = savedConnection(app.connections, shows.connection)?.readOnly ?? false;
  const page = view({ console, readOnly, databases: databasesOf(shows.connection) });
  const docs = tab.docs?.read.commands ?? builtinDocs(versionOf(app, shows.connection)).commands;
  return (
    <div className={styles['page']} data-state={page.state}>
      <Toolbar tabId={tabId} console={console} toolbar={page.toolbar} />
      <ConsoleOutput tabId={tabId} tab={tab} console={console} />
      <ConsoleInput tabId={tabId} tab={tab} console={console} docs={docs} />
    </div>
  );
}

/** The page of the active console tab. */
export function ConsolePage(): React.JSX.Element | null {
  const app = useAppState();
  const active = activeTabOf(app.tabs);
  useEffect(() => {
    forgetClosed(new Set(app.tabs.tabs.map((tab) => tab.id)));
  }, [app.tabs.tabs]);
  if (active?.shows.kind !== 'console') {
    return null;
  }
  return <ConsoleTabPage key={active.id} tabId={active.id} shows={active.shows} app={app} />;
}
