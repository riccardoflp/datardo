/**
 * `home.show`: the Home page, drawn from what `src/features/home/show.ts` returns: the welcome with no saved
 * connection; otherwise the row of the filter (`home.filter`), **Jump back in** and the cards by folder
 * (`home.connections`). Typing a character with the focus in the page types it in the filter. With the focus on a
 * card, the arrow keys move between the cards, across the groups.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useState, type KeyboardEvent } from 'react';
import { view as homeView, type HomeButton, type WithConnections } from '../../../features/home/show';
import { runnableFeatures } from '../../../features/registry';
import { featureId } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import menuStyles from '../../connection/connection-menu.module.css';
import { FolderMenuButton } from '../../connection/folder-menu';
import { startFeature } from '../../shell/intent';
import { AppIcon } from '../../shell/top-bar/app-icon';
import { useAppState } from '../../state/store';
import { HomeCard } from './home-card';
import { JumpBackIn } from './jump-back-in';
import styles from './home-page.module.css';

const runnable = runnableFeatures();

/** The filter field, which typing anywhere in the page types in. */
const filterId = 'home-filter';

/** Whether the feature a button starts is built: the import and the export of connections come with their cards. */
function isBuilt(button: HomeButton): boolean {
  return runnable.has(featureId(button.feature));
}

function start(button: HomeButton): void {
  startFeature(button.feature, { place: 'home' });
}

function Welcome(props: {
  readonly shown: Extract<ReturnType<typeof homeView>, { kind: 'welcome' }>;
}): React.JSX.Element {
  const { shown } = props;
  return (
    <div className={styles['welcome']}>
      <span className={styles['welcomeIcon']}>
        <AppIcon large />
      </span>
      <h1 className={styles['title']}>{shown.title}</h1>
      <p className={styles['muted']}>{shown.line}</p>
      <div className={styles['buttons']}>
        {[shown.add, shown.import].map((button, index) => (
          <button
            key={button.element}
            type="button"
            className={index === 0 ? styles['primary'] : styles['button']}
            data-feature={button.element}
            disabled={!isBuilt(button)}
            onClick={() => {
              start(button);
            }}
          >
            {button.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The `…` of the filter row: the import and the export of connections. */
function MoreMenu({ more }: { readonly more: WithConnections['more'] }): React.JSX.Element {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={styles['iconButton']} aria-label={more.label} title={more.label}>
          <span className="codicon codicon-ellipsis" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={menuStyles['menu']} aria-label={more.label} align="end">
          {more.entries.map((entry) => (
            <DropdownMenu.Item
              key={entry.element}
              className={menuStyles['item']}
              data-feature={entry.element}
              disabled={!isBuilt(entry)}
              onSelect={() => {
                start(entry);
              }}
            >
              {entry.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function FilterRow(props: {
  readonly shown: WithConnections;
  readonly typed: string;
  readonly setTyped: (typed: string) => void;
}): React.JSX.Element {
  const { shown } = props;
  return (
    <div className={styles['filterRow']}>
      <input
        id={filterId}
        type="search"
        className={styles['filter']}
        placeholder={shown.filter.placeholder}
        aria-label={shown.filter.label}
        data-feature={shown.filter.element}
        value={props.typed}
        onChange={(event) => {
          props.setTyped(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && props.typed !== '') {
            event.preventDefault();
            props.setTyped('');
          }
        }}
      />
      {shown.filter.engines === undefined ? null : (
        <div role="radiogroup" aria-label={shown.filter.enginesLabel} className={styles['engines']}>
          {shown.filter.engines.map((engine) => (
            <button
              key={engine.engine}
              type="button"
              role="radio"
              aria-checked={engine.chosen}
              className={styles['engine']}
              data-feature={shown.filter.element}
              onClick={() => {
                startFeature('home.show', { place: 'home', args: { engine: engine.engine } });
              }}
            >
              {engine.label} <span className={styles['count']}>{engine.count}</span>
            </button>
          ))}
        </div>
      )}
      <span className={styles['grow']} />
      <button
        type="button"
        className={styles['primary']}
        data-feature={shown.add.element}
        onClick={() => {
          start(shown.add);
        }}
      >
        {shown.add.label}
      </button>
      <MoreMenu more={shown.more} />
    </div>
  );
}

/** The card the arrow keys move the focus to, across the groups. */
function moveBetweenCards(event: KeyboardEvent<HTMLElement>): void {
  const from = event.target instanceof HTMLElement ? event.target : null;
  if (from?.dataset['card'] === undefined) {
    return;
  }
  const cards = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-card]')];
  const index = cards.indexOf(from);
  const columns = getComputedStyle(from.parentElement ?? from).gridTemplateColumns.split(' ').length;
  const steps: Readonly<Record<string, number>> = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: columns,
    ArrowUp: -columns,
  };
  const step = steps[event.key];
  const to = step === undefined ? undefined : cards[Math.min(cards.length - 1, Math.max(0, index + step))];
  if (to !== undefined) {
    event.preventDefault();
    to.focus();
  }
}

function Connections(props: { readonly shown: WithConnections; readonly state: AppState }): React.JSX.Element {
  const { connections } = props.shown;
  return (
    <section className={styles['section']} aria-labelledby="home-connections" onKeyDown={moveBetweenCards}>
      <h2 id="home-connections" className={styles['heading']}>
        {connections.heading}
      </h2>
      {connections.noMatch === undefined ? null : <p className={styles['muted']}>{connections.noMatch}</p>}
      {connections.groups.map((group) => (
        <div key={group.folder ?? ''} className={styles['folder']}>
          {group.folder === undefined ? null : (
            <div className={styles['folderHeading']}>
              <button
                type="button"
                className={styles['folderName']}
                aria-expanded={!group.collapsed}
                data-feature="home.connections@home"
                onClick={() => {
                  startFeature('home.show', {
                    place: 'home',
                    args: { folder: group.folder ?? '', collapsed: !group.collapsed },
                  });
                }}
              >
                <span className={`codicon codicon-chevron-${group.collapsed ? 'right' : 'down'}`} aria-hidden="true" />
                {group.heading}
              </button>
              <FolderMenuButton folder={group.folder} place="home" className={styles['iconButton']} />
            </div>
          )}
          {group.cards.length === 0 ? null : (
            <div className={styles['cards']}>
              {group.cards.map((card) => (
                <HomeCard key={card.id} card={card} state={props.state} />
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

/** The Home page. */
export function HomePage(): React.JSX.Element {
  const state = useAppState();
  const [typed, setTyped] = useState('');
  const shown = homeView({ state, typed });
  if (shown.kind === 'welcome') {
    return <Welcome shown={shown} />;
  }
  const typeInFilter = (event: KeyboardEvent<HTMLDivElement>): void => {
    const inField = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      document.getElementById(filterId)?.focus();
      return;
    }
    if (!inField && event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey && event.key !== ' ') {
      event.preventDefault();
      setTyped(typed + event.key);
      document.getElementById(filterId)?.focus();
    }
  };
  return (
    <div className={styles['page']} onKeyDown={typeInFilter}>
      <FilterRow shown={shown} typed={typed} setTyped={setTyped} />
      <div className={styles['content']}>
        {shown.jumpBackIn === undefined ? null : <JumpBackIn part={shown.jumpBackIn} />}
        <Connections shown={shown} state={state} />
      </div>
    </div>
  );
}
