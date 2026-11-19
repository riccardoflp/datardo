/**
 * `runner.notify`: the notifications at the bottom right, drawn from what `src/features/runner/notify.ts` returns.
 * They never take the focus; a screen reader is told of each, at once for an error. *info* and *success* go away
 * after 6 seconds unless the pointer or the focus is on them. `F6` reaches them as a region after the islands.
 */
import { useEffect, useRef, useState } from 'react';
import { view, type NotificationView } from '../../features/runner/notify';
import { runnerText } from '../../features/runner/text';
import { useAppState } from '../state/store';
import styles from './notifications.module.css';

function close(id: string): void {
  void window.datardo.dismiss({ kind: 'notification', id });
}

function showInLog(line: number | undefined): void {
  void window.datardo.start({
    feature: 'runner.log' as never,
    target: { kind: 'app' },
    place: 'notification',
    ...(line === undefined ? {} : { args: { line } }),
  });
}

/** One notification. */
function NotificationItem({ item }: { readonly item: NotificationView }): React.JSX.Element {
  const [held, setHeld] = useState(false);
  const [details, setDetails] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (item.goesAwayAfterMs === undefined || held) {
      return undefined;
    }
    const timer = setTimeout(() => {
      close(item.id);
    }, item.goesAwayAfterMs);
    return () => {
      clearTimeout(timer);
    };
  }, [item.id, item.goesAwayAfterMs, held, item.times]);
  return (
    <div
      ref={ref}
      className={`${styles['notification'] ?? ''} ${styles[item.level] ?? ''}`}
      data-level={item.level}
      data-feature={item.element}
      onMouseEnter={() => {
        setHeld(true);
      }}
      onMouseLeave={() => {
        setHeld(ref.current?.contains(document.activeElement) === true);
      }}
      onFocus={() => {
        setHeld(true);
      }}
      onBlur={(event) => {
        setHeld(ref.current?.contains(event.relatedTarget) === true || ref.current?.matches(':hover') === true);
      }}
    >
      <p className={styles['text']}>
        {item.text}
        {item.times === undefined ? null : <span className={styles['times']}> {item.times}</span>}
      </p>
      {details && item.details !== undefined ? <DetailsText text={item.details} /> : null}
      <div className={styles['actions']}>
        {item.actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={styles['action']}
            data-feature={action.element}
            onClick={() => {
              void window.datardo.start({
                feature: action.feature,
                target: action.target,
                place: 'notification',
                ...(action.args === undefined ? {} : { args: action.args }),
              });
              close(item.id);
            }}
          >
            {action.label}
          </button>
        ))}
        {item.details === undefined ? null : (
          <button
            type="button"
            className={styles['action']}
            data-feature="runner.refuse@notification"
            aria-expanded={details}
            onClick={() => {
              setDetails(!details);
            }}
          >
            {runnerText.details}
          </button>
        )}
        <button
          type="button"
          className={styles['action']}
          data-feature="runner.log@notification"
          onClick={() => {
            showInLog(item.logLine);
          }}
        >
          {runnerText.showInLog}
        </button>
        <button
          type="button"
          className={styles['close']}
          data-feature="runner.notify@notification"
          aria-label={runnerText.close}
          onClick={() => {
            close(item.id);
          }}
        >
          <span className="codicon codicon-close" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** **Details**: the code of a refusal or the original text of an error, which can be selected and copied. */
function DetailsText({ text }: { readonly text: string }): React.JSX.Element {
  return (
    <div className={styles['details']}>
      <code className={styles['code']}>{text}</code>
      <button
        type="button"
        className={styles['action']}
        onClick={() => {
          void navigator.clipboard.writeText(text);
        }}
      >
        {runnerText.copy}
      </button>
    </div>
  );
}

/** The notifications shown, the newest at the bottom; a screen reader is told of an error at once, of others politely. */
export function Notifications(): React.JSX.Element {
  const state = useAppState();
  const items = view(state.runner);
  const told = (announce: NotificationView['announce']): string =>
    items
      .filter((item) => item.announce === announce)
      .map((item) => item.text)
      .join(' ');
  return (
    <section
      className={styles['region']}
      aria-label={runnerText.notifications}
      tabIndex={-1}
      data-region="notifications"
    >
      <div className={styles['stack']}>
        {items.map((item) => (
          <NotificationItem key={item.id} item={item} />
        ))}
      </div>
      <div role="status" aria-live="polite" className={styles['spoken']}>
        {told('polite')}
      </div>
      <div role="alert" aria-live="assertive" className={styles['spoken']}>
        {told('assertive')}
      </div>
    </section>
  );
}
