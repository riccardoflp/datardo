/**
 * The two lists at the left of the Pub/Sub page: **Subscriptions** (`pubsub.subscriptions@list`), each item with `✕`,
 * `Delete` and its context menu (`@item-menu`); and **Active channels** (`pubsub.channels@list`), with its own filter
 * field and **Refresh**, each channel with **Subscribe** and its context menu.
 */
import { activeChannels, type ActiveChannel } from '../../../features/pubsub/channels';
import { commandWord } from '../../../features/pubsub/copy';
import { view as subscriptionsView, type MenuEntry } from '../../../features/pubsub/subscriptions';
import { text } from '../../../features/pubsub/text';
import type { PubSubPage } from '../../../features/pubsub/types';
import type { ConnectionView } from '../../../shared/connection';
import { act } from './pubsub-actions';
import { isMenuKey, menuPoint, type OpenMenu } from './pubsub-menu';
import { readChannels } from './pubsub-channels';
import { readOnlyTooltip } from './pubsub-state';
import { changePubSubTab, type PubSubTab } from './pubsub-store';
import styles from './pubsub-page.module.css';

type OpenAt = (menu: OpenMenu) => void;

function itemMenu(
  entries: readonly MenuEntry[],
  name: string,
  element: string,
  at: { x: number; y: number },
): OpenMenu {
  return { label: name, entries, element, place: 'item-menu', ...at };
}

/** The list **Subscriptions**. */
export function SubscriptionsList(props: {
  readonly tabId: string;
  readonly page: PubSubPage;
  readonly connection: ConnectionView;
  readonly onMenu: OpenAt;
}): React.JSX.Element {
  const { tabId, onMenu } = props;
  const readOnly = readOnlyTooltip(props.connection);
  const shown = subscriptionsView({
    subscriptions: props.page.subscriptions,
    ...(readOnly === undefined ? {} : { readOnly }),
  });
  return (
    <section className={styles['list']} aria-label={shown.header} data-feature="pubsub.subscriptions@list">
      <div className={styles['list-head']}>
        <h2 className={styles['list-title']}>
          {shown.header} <span className={styles['count']}>{shown.count}</span>
        </h2>
        {shown.unsubscribeAll === undefined ? null : (
          <button
            type="button"
            className={styles['link-button']}
            data-feature={shown.unsubscribeAll.element}
            onClick={() => {
              if (shown.unsubscribeAll !== undefined) {
                act(tabId, shown.unsubscribeAll, 'list');
              }
            }}
          >
            {shown.unsubscribeAll.label}
          </button>
        )}
      </div>
      {shown.empty === undefined ? null : <p className={styles['note']}>{shown.empty}</p>}
      <ul className={styles['items']}>
        {shown.items.map((item) => (
          <li
            key={`${item.kind} ${item.name}`}
            className={styles['entry']}
            tabIndex={0}
            data-dim={item.subscribing === undefined ? undefined : 'true'}
            title={item.subscribing}
            onKeyDown={(event) => {
              if (event.key === 'Delete') {
                event.preventDefault();
                act(tabId, item.remove, 'list');
              } else if (isMenuKey(event)) {
                event.preventDefault();
                onMenu(
                  itemMenu(item.menu, item.name, 'pubsub.subscriptions@item-menu', menuPoint(event.currentTarget)),
                );
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              onMenu(
                itemMenu(item.menu, item.name, 'pubsub.subscriptions@item-menu', {
                  x: event.clientX,
                  y: event.clientY,
                }),
              );
            }}
          >
            <span className={styles['kind']} title={item.mark}>
              {item.mark}
            </span>
            <span className={styles['entry-name']}>{item.name}</span>
            <span className={styles['count']}>{item.received}</span>
            <button
              type="button"
              className={styles['row-button']}
              data-feature={item.remove.element}
              aria-label={`${item.remove.label} ${item.name}`}
              title={item.remove.label}
              onClick={() => {
                act(tabId, item.remove, 'list');
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function channelMenu(channel: ActiveChannel, readOnly: string | undefined): readonly MenuEntry[] {
  return [
    {
      label: text.channels.publishTo,
      feature: 'pubsub.publish',
      element: 'pubsub.publish@item-menu',
      args: { channel: channel.text },
      ...(readOnly === undefined ? {} : { disabled: readOnly }),
    },
    { label: text.channels.copyName, copies: channel.text },
  ];
}

function ChannelItem(props: {
  readonly tabId: string;
  readonly channel: ActiveChannel;
  readonly readOnly: string | undefined;
  readonly onMenu: OpenAt;
}): React.JSX.Element {
  const { tabId, channel } = props;
  const entries = channelMenu(channel, props.readOnly);
  const open = (at: { x: number; y: number }): void => {
    props.onMenu(itemMenu(entries, channel.text, 'pubsub.channels@item-menu', at));
  };
  return (
    <li
      className={styles['entry']}
      tabIndex={0}
      onKeyDown={(event) => {
        if (isMenuKey(event)) {
          event.preventDefault();
          open(menuPoint(event.currentTarget));
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        open({ x: event.clientX, y: event.clientY });
      }}
    >
      <span className={styles['entry-name']}>{channel.text}</span>
      <span className={styles['count']}>
        {channel.subscribers === undefined ? '' : String(channel.subscribers)}
        {channel.thisPage === undefined ? '' : ` ${channel.thisPage}`}
      </span>
      <button
        type="button"
        className={styles['row-button']}
        data-feature="pubsub.subscribe@list"
        aria-label={`${text.channels.subscribe} ${channel.text}`}
        onClick={() => {
          act(
            tabId,
            {
              label: text.channels.subscribe,
              feature: 'pubsub.subscribe',
              element: 'pubsub.subscribe@list',
              args: { names: commandWord(channel.name), kind: 'channel' },
            },
            'list',
          );
        }}
      >
        {text.channels.subscribe}
      </button>
    </li>
  );
}

/** The list **Active channels**. */
export function ChannelsList(props: {
  readonly tabId: string;
  readonly tab: PubSubTab;
  readonly page: PubSubPage;
  readonly connection: ConnectionView;
  readonly onMenu: OpenAt;
}): React.JSX.Element {
  const { tabId, tab } = props;
  const shown = activeChannels(tab.channels, props.page.subscriptions);
  const readOnly = readOnlyTooltip(props.connection);
  return (
    <section className={styles['list']} aria-label={text.channels.header} data-feature="pubsub.channels@list">
      <div className={styles['list-head']}>
        <h2 className={styles['list-title']}>{text.channels.header}</h2>
        <button
          type="button"
          className={styles['link-button']}
          onClick={() => {
            void readChannels(tabId);
          }}
        >
          {text.channels.refresh}
        </button>
      </div>
      <input
        className={styles['input']}
        type="search"
        aria-label={text.channels.filter}
        placeholder={text.channels.filter}
        value={tab.channelsFilter}
        onChange={(event) => {
          const channelsFilter = event.target.value;
          changePubSubTab(tabId, (state) => ({ ...state, channelsFilter }));
        }}
      />
      {shown.empty === undefined ? null : <p className={styles['note']}>{shown.empty}</p>}
      <ul className={styles['items']}>
        {shown.channels.map((channel) => (
          <ChannelItem key={channel.text} tabId={tabId} channel={channel} readOnly={readOnly} onMenu={props.onMenu} />
        ))}
      </ul>
      {shown.more === undefined ? null : <p className={styles['note']}>{shown.more}</p>}
      {shown.patterns === undefined ? null : <p className={styles['note']}>{shown.patterns}</p>}
    </section>
  );
}
