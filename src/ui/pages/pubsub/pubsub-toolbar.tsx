/**
 * The top of the Pub/Sub page (`pubsub.show`): the toolbar (`@toolbar`) with the field **Channel or pattern**, its kind
 * and **Subscribe**, **Pause**, **Clear**, the field **Filter messages** with the mark of **Show only its messages**,
 * **Events of**, **Export…** and **Publish…**; the state on one line with the counts; the banner of
 * `pubsub.reconnect` with **Reconnect now**, **Connect** when the saved connection was disconnected, and the sentence
 * about an empty channel prefix.
 */
import type { ShowView, ToolbarControl } from '../../../features/pubsub/show';
import { text } from '../../../features/pubsub/text';
import type { NameKind, PubSubPage } from '../../../features/pubsub/types';
import { startFeature } from '../../shell/intent';
import { act, changeFilter, chooseNameKind, pageTarget, subscribeTyped } from './pubsub-actions';
import { changePubSubTab, type PubSubTab } from './pubsub-store';
import styles from './pubsub-page.module.css';

/** A button for a control of the View; a disabled one says why in its tooltip. */
function ControlButton(props: {
  readonly tabId: string;
  readonly control: ToolbarControl;
  readonly selected?: readonly number[];
  readonly onClick?: () => void;
}): React.JSX.Element {
  const { control } = props;
  return (
    <button
      type="button"
      className={styles['button']}
      data-feature={control.element}
      aria-disabled={control.disabled === undefined ? undefined : true}
      title={control.tooltip ?? (control.disabled === '' ? undefined : control.disabled)}
      onClick={
        props.onClick ??
        (() => {
          act(props.tabId, control, 'toolbar', props.selected);
        })
      }
    >
      {control.label}
    </button>
  );
}

function NameField(props: {
  readonly tabId: string;
  readonly tab: PubSubTab;
  readonly page: PubSubPage;
  readonly name: ShowView['toolbar']['name'];
}): React.JSX.Element {
  const { tabId, name } = props;
  const error = props.page.fieldError;
  return (
    <div className={styles['name-field']}>
      <div className={styles['field']}>
        <input
          className={styles['input']}
          type="text"
          aria-label={name.label}
          placeholder={name.label}
          value={props.tab.typed}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : `${tabId}-name-error`}
          onChange={(event) => {
            const typed = event.target.value;
            changePubSubTab(tabId, (state) => ({ ...state, typed }));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void subscribeTyped(tabId);
            }
          }}
        />
        <select
          className={styles['input']}
          aria-label={text.subscribe.kind}
          value={props.tab.nameKind}
          onChange={(event) => {
            chooseNameKind(tabId, event.target.value as NameKind);
          }}
        >
          {name.kinds.map((each) => (
            <option key={each.kind} value={each.kind}>
              {each.label}
            </option>
          ))}
        </select>
        <ControlButton tabId={tabId} control={name.subscribe} onClick={() => void subscribeTyped(tabId)} />
      </div>
      {error === undefined ? null : (
        <p id={`${tabId}-name-error`} className={styles['field-error']} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function FilterField(props: { readonly tabId: string; readonly filter: ShowView['toolbar']['filter'] }) {
  const { tabId, filter } = props;
  return (
    <div className={styles['field']} data-feature={filter.element}>
      <input
        className={styles['input']}
        type="search"
        aria-label={filter.label}
        placeholder={filter.label}
        value={filter.value}
        onChange={(event) => {
          const typed = event.target.value;
          changeFilter(tabId, (now) => ({ ...now, text: typed }));
        }}
      />
      {filter.mark === undefined ? null : (
        <span className={styles['mark']}>
          {filter.mark}
          <button
            type="button"
            className={styles['row-button']}
            aria-label={`${text.subscriptions.showOnly} ${filter.mark} ✕`}
            onClick={() => {
              changeFilter(tabId, (now) => ({ text: now.text }));
            }}
          >
            ✕
          </button>
        </span>
      )}
    </div>
  );
}

function EventsOf(props: { readonly tabId: string; readonly page: PubSubPage; readonly shown: ShowView }) {
  const eventsOf = props.shown.toolbar.eventsOf;
  if (eventsOf === undefined) {
    return null;
  }
  const chosen = eventsOf.choices.find((each) => each.chosen)?.connection ?? '';
  return (
    <label className={styles['field']}>
      <span>{eventsOf.label}</span>
      <select
        className={styles['input']}
        data-feature={eventsOf.element}
        value={chosen}
        onChange={(event) => {
          const mongo = event.target.value;
          startFeature('pubsub.follow-oplog', {
            place: 'toolbar',
            ...(mongo === ''
              ? { target: pageTarget(props.page.connection), args: 'off' }
              : { target: pageTarget(mongo as PubSubPage['connection']) }),
          });
        }}
      >
        {eventsOf.choices.map((each) => (
          <option key={each.connection ?? ''} value={each.connection ?? ''}>
            {each.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The toolbar. */
export function PubSubToolbar(props: {
  readonly tabId: string;
  readonly tab: PubSubTab;
  readonly page: PubSubPage;
  readonly shown: ShowView;
}): React.JSX.Element {
  const { tabId, page, shown } = props;
  const toolbar = shown.toolbar;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={shown.title}>
      <NameField tabId={tabId} tab={props.tab} page={page} name={toolbar.name} />
      <ControlButton tabId={tabId} control={toolbar.pause} />
      <ControlButton tabId={tabId} control={toolbar.clear} />
      <FilterField tabId={tabId} filter={toolbar.filter} />
      <EventsOf tabId={tabId} page={page} shown={shown} />
      <ControlButton tabId={tabId} control={toolbar.export} selected={page.selected} />
      <ControlButton tabId={tabId} control={toolbar.publish} />
    </div>
  );
}

/** The state on one line, the banner of a closed connection, **Connect**, and the sentence about the prefix. */
export function PubSubState(props: { readonly tabId: string; readonly shown: ShowView }): React.JSX.Element {
  const { tabId, shown } = props;
  return (
    <>
      <p className={styles['state']} role="status">
        <span>{shown.state}</span> <span className={styles['count']}>{shown.counts}</span>
        {shown.connect === undefined ? null : (
          <ControlButton
            tabId={tabId}
            control={shown.connect}
            onClick={() => {
              const page = shown.connect;
              if (page !== undefined) {
                act(tabId, page, 'toolbar');
              }
            }}
          />
        )}
      </p>
      {shown.banner === undefined ? null : (
        <div className={styles['banner']} role="alert">
          {shown.banner.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <ControlButton tabId={tabId} control={shown.banner.reconnect} />
        </div>
      )}
      {shown.notice === undefined ? null : <p className={styles['notice']}>{shown.notice}</p>}
    </>
  );
}
