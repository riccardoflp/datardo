/**
 * `runner.progress`: the list of work in progress, opened by a click on the count of the status line
 * ({@link openWorkList}). Each item has its title, its connection, the time since it started, its progress and
 * **Cancel** (`runner.cancel`), or why it cannot be cancelled; one that failed stays with its error until dismissed.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { view, type WorkView } from '../../features/runner/progress';
import { runnerText } from '../../features/runner/text';
import type { WorkId } from '../../shared/ids';
import { useAppState } from '../state/store';
import styles from './work-list.module.css';

let open = false;
const listeners = new Set<() => void>();

function setOpen(value: boolean): void {
  open = value;
  for (const listener of listeners) {
    listener();
  }
}

/** Opens the list of work, or closes it when it is open: what a click on the count of the status line does. */
export function openWorkList(): void {
  setOpen(!open);
}

function useOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
  );
}

/** The time now, read again every second while the list shows. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

function Item({ item }: { readonly item: WorkView }): React.JSX.Element {
  return (
    <li className={styles['item']} data-failed={item.error === undefined ? undefined : 'true'}>
      <div className={styles['line']}>
        <span className={styles['title']}>{item.title}</span>
        <span className={styles['muted']}>{item.elapsed}</span>
      </div>
      {item.connection === undefined ? null : <span className={styles['muted']}>{item.connection}</span>}
      {item.error === undefined ? (
        <progress
          className={styles['bar']}
          aria-label={item.title}
          {...(item.fraction === undefined ? {} : { value: item.fraction, max: 1 })}
        />
      ) : (
        <p className={styles['error']}>{item.error}</p>
      )}
      <div className={styles['line']}>
        <span className={styles['muted']}>{item.cancelled ? runnerText.cancelled : (item.progress ?? '')}</span>
        {item.error !== undefined ? (
          <button
            type="button"
            className={styles['button']}
            data-feature="runner.progress@list"
            onClick={() => {
              void window.datardo.dismiss({ kind: 'work', id: item.id });
            }}
          >
            {runnerText.dismiss}
          </button>
        ) : item.cancellable ? (
          <button
            type="button"
            className={styles['button']}
            data-feature="runner.cancel@list"
            onClick={() => {
              void window.datardo.cancel(item.id as WorkId);
            }}
          >
            {runnerText.cancel}
          </button>
        ) : (
          <span className={styles['muted']}>{item.cannotCancel ?? ''}</span>
        )}
      </div>
    </li>
  );
}

/** The list of work, when it is open. */
export function WorkList(): React.JSX.Element | null {
  const shown = useOpen();
  const state = useAppState();
  const now = useNow();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (shown) {
      panel.current?.focus();
    }
  }, [shown]);
  if (!shown) {
    return null;
  }
  const work = view({ work: state.runner.work, now });
  return (
    <section
      ref={panel}
      className={styles['panel']}
      aria-label={runnerText.workInProgress}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
        }
      }}
    >
      <div className={styles['line']}>
        <h2 className={styles['heading']}>{runnerText.workInProgress}</h2>
        <button
          type="button"
          className={styles['button']}
          aria-label={runnerText.close}
          onClick={() => {
            setOpen(false);
          }}
        >
          <span className="codicon codicon-close" aria-hidden="true" />
        </button>
      </div>
      <ul className={styles['items']}>
        {work.items.map((item) => (
          <Item key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}
