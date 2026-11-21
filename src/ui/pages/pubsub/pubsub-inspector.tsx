/**
 * `nav.inspector` on the Pub/Sub page: the message selected, whole (`pubsub.inspect`): its channel, when and through
 * what it arrived, its size, the event it is with the channels it arrived on, and its value as `value.format` shows it
 * with **Text**, **JSON** and **Hexadecimal**, drawn a part at a time so that a value of 1 MB does not stop the window;
 * then **Copy** and **Publish again…** (`@inspector`).
 */
import { useEffect, useState } from 'react';
import { view as inspectView, type MessageInspection } from '../../../features/pubsub/inspect';
import { text } from '../../../features/pubsub/text';
import { shown as formatted } from '../../../features/value/format';
import { useAppState } from '../../state/store';
import { act } from './pubsub-actions';
import { connectionOf, pageOfTab, readOnlyTooltip } from './pubsub-state';
import { changePubSubTab, usePubSubTab } from './pubsub-store';
import styles from './pubsub-page.module.css';

/** How many characters of the value are drawn at a time (Datardo's choice). */
const partCharacters = 64 * 1024;

/** The value, drawn a part at a time until it is whole. */
function Value(props: { readonly text: string }): React.JSX.Element {
  const [drawn, setDrawn] = useState(partCharacters);
  useEffect(() => {
    if (drawn >= props.text.length) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      setDrawn((now) => now + partCharacters);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [drawn, props.text]);
  return <pre className={styles['value']}>{props.text.slice(0, drawn)}</pre>;
}

function Lines(props: { readonly lines: readonly { readonly label: string; readonly value: string }[] }) {
  return (
    <dl className={styles['lines']}>
      {props.lines.map((line) => (
        <div key={line.label} style={{ display: 'contents' }}>
          <dt>{line.label}</dt>
          <dd>{line.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Inspected(props: {
  readonly tabId: string;
  readonly row: number;
  readonly shown: MessageInspection;
  readonly chosen?: string;
}) {
  const { tabId, shown } = props;
  const choice = shown.value.choices.find((each) => each.format === props.chosen && each.enabled);
  const value = formatted(shown.value.bytes, choice?.format, 'full');
  return (
    <div className={styles['inspected']} data-feature="pubsub.inspect@inspector">
      <h2 className={styles['list-title']}>{shown.title}</h2>
      <Lines lines={[shown.received, shown.through, shown.size, ...(shown.event ?? [])]} />
      {shown.channels === undefined ? null : (
        <>
          <h3 className={styles['list-title']}>{shown.channels.label}</h3>
          <Lines lines={shown.channels.items.map((each) => ({ label: each.channel, value: each.received }))} />
        </>
      )}
      <div className={styles['buttons']} role="radiogroup" aria-label={text.inspect.format}>
        {shown.value.choices.map((each) => (
          <button
            key={each.format}
            type="button"
            role="radio"
            className={styles['button']}
            aria-checked={each.format === value.format}
            disabled={!each.enabled}
            onClick={() => {
              changePubSubTab(tabId, (state) => ({ ...state, format: each.format }));
            }}
          >
            {each.label}
          </button>
        ))}
      </div>
      {value.note === undefined ? null : <p className={styles['note']}>{value.note}</p>}
      <Value key={`${props.row}-${value.format}`} text={value.text} />
      <div className={styles['buttons']}>
        {[shown.copy, shown.publishAgain].map((entry) => (
          <button
            key={entry.label}
            type="button"
            className={styles['button']}
            data-feature={entry.element}
            aria-disabled={entry.disabled === undefined ? undefined : true}
            title={entry.disabled}
            onClick={() => {
              act(tabId, entry, 'inspector');
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The inspector island of a Pub/Sub tab with a row selected. */
export function PubSubInspector({ tabId }: { readonly tabId: string }): React.JSX.Element | null {
  const app = useAppState();
  const tab = usePubSubTab(tabId);
  const page = tab === undefined ? undefined : pageOfTab(app, tab);
  const connection = tab === undefined ? undefined : connectionOf(app, tab.connection);
  if (tab === undefined || page === undefined || connection === undefined) {
    return null;
  }
  const readOnly = readOnlyTooltip(connection);
  const shown = inspectView({ page, ...(readOnly === undefined ? {} : { readOnly }) });
  if (shown === undefined) {
    return null;
  }
  return shown.kind === 'gap' ? (
    <p className={styles['inspected']} data-feature="pubsub.inspect@inspector">
      {shown.title}
    </p>
  ) : (
    <Inspected
      tabId={tabId}
      row={page.inspected ?? 0}
      shown={shown}
      {...(tab.format === undefined ? {} : { chosen: tab.format })}
    />
  );
}
