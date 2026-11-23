/**
 * `key.inspect`: the selected key in the inspector island, drawn from its View: the name with **Copy name**, its type,
 * expiry (counted again every second), size and encoding, the line of a module's type, and the buttons of what can be
 * done to it, then its value in the compact form (`value.show`). It is read 150 ms after the selection settles, and
 * again after every refresh of its tab; what it showed stays in place, dimmed after a moment, until the read comes.
 */
import { useEffect, useState } from 'react';
import { settleMs } from '../../../features/key/details';
import { view, type InspectButton, type InspectView } from '../../../features/key/inspect';
import type { InspectRead } from '../../../features/key/inspect';
import { bytesOfHex, hexOf } from '../../../features/key/types';
import type { Place } from '../../../shared/ids';
import type { Target } from '../../../shared/target';
import { startFeature } from '../../shell/intent';
import { useAppState } from '../../state/store';
import { readInspected } from './keys-reads';
import { factsOf, selectionOf } from './keys-state';
import { useKeysTab } from './keys-store';
import styles from './keys-page.module.css';
import { ValueCompact } from '../value/value-inspector';

/** The time the expiry is counted from, read again every second. */
export function useClock(): number {
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

/**
 * A button of the key shown. While the island still shows the last key read and another is being read, its buttons
 * are disabled, so that none acts on a key that is no longer the one selected.
 */
function ActionButton(props: {
  readonly button: InspectButton;
  readonly target: Target;
  readonly place: Place;
  readonly busy?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      className={styles['button']}
      data-feature={props.button.element}
      disabled={props.busy === true}
      onClick={() => {
        startFeature(props.button.feature, { place: props.place, target: props.target });
      }}
    >
      {props.button.label}
    </button>
  );
}

/** A read of a key as an island keeps it: the key in hexadecimal, what was read, and whether it is read again. */
export interface KeptRead {
  readonly key: string;
  readonly read: InspectRead;
  readonly stale?: boolean;
}

/**
 * What an island shows of the key selected: its read once it came, else the last read the island showed, until the
 * new one comes. A read in progress leaves what was shown in place (R10.8).
 */
export function useKeptRead(fresh: KeptRead | undefined): KeptRead | undefined {
  const usable = fresh !== undefined && fresh.read.kind !== 'loading' ? fresh : undefined;
  const [kept, setKept] = useState(usable);
  if (usable !== undefined && usable !== kept) {
    setKept(usable);
  }
  return usable ?? kept;
}

/** What `key.inspect` shows of one key, with its buttons started on `target` from `place`. */
export function KeyDetails(props: {
  readonly shown: InspectView;
  readonly target: Target;
  readonly place: Place;
  readonly buttons?: boolean;
  /** What is shown is read again, or is the key selected before: it stays, dimmed after a moment. */
  readonly busy?: boolean;
}): React.JSX.Element {
  const { shown, target, place } = props;
  return (
    <div className={styles['inspected']} aria-busy={shown.loading === true || props.busy === true ? true : undefined}>
      <div className={styles['name']}>{shown.name}</div>
      {props.buttons === false ? null : (
        <div className={styles['buttons']}>
          <ActionButton button={shown.copyName} target={target} place={place} busy={props.busy} />
        </div>
      )}
      {shown.message === undefined ? null : <p role="status">{shown.message}</p>}
      <dl className={styles['lines']}>
        {shown.lines.map((line) => (
          <div key={line.label} style={{ display: 'contents' }}>
            <dt>{line.label}</dt>
            <dd title={line.tooltip}>
              {line.value}{' '}
              {(props.buttons === false ? [] : (line.buttons ?? [])).map((button) => (
                <ActionButton key={button.element} button={button} target={target} place={place} busy={props.busy} />
              ))}
            </dd>
          </div>
        ))}
      </dl>
      {shown.value?.kind === 'module' ? <p>{shown.value.text}</p> : null}
      {props.buttons === false ? null : (
        <div className={styles['buttons']}>
          {shown.buttons.map((button) => (
            <ActionButton key={button.element} button={button} target={target} place={place} busy={props.busy} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The inspector island of a keys tab with one key selected. */
export function KeyInspector({ tabId }: { readonly tabId: string }): React.JSX.Element | null {
  const app = useAppState();
  const tab = useKeysTab(tabId);
  const now = useClock();
  const selected = tab === undefined ? undefined : selectionOf(app, tab).inspector;
  const keyHex = selected?.kind === 'one' ? hexOf(selected.key) : undefined;
  const inspected = tab?.inspected;
  const readFor = inspected?.key;
  const stale = inspected?.stale === true;
  useEffect(() => {
    if (keyHex === undefined || (readFor === keyHex && !stale)) {
      return undefined;
    }
    const timer = setTimeout(() => {
      void readInspected(tabId, keyHex);
    }, settleMs);
    return () => {
      clearTimeout(timer);
    };
  }, [tabId, keyHex, readFor, stale]);
  const fresh = inspected !== undefined && inspected.key === keyHex ? inspected : undefined;
  const kept = useKeptRead(fresh);
  const selectedName = keyHex === undefined ? undefined : bytesOfHex(keyHex);
  if (tab === undefined || selectedName === undefined) {
    return null;
  }
  const name = (kept === undefined ? undefined : bytesOfHex(kept.key)) ?? selectedName;
  const read: InspectRead = kept?.read ?? { kind: 'loading' };
  const busy = fresh === undefined || fresh.stale === true;
  const shown = view({ name, readOnly: factsOf(app, tab.where.connection).readOnly, read, now });
  const target: Target = { kind: 'key', connection: tab.where.connection, database: tab.where.database, key: name };
  const type = read.kind === 'loaded' && shown.value?.kind === 'value' ? read.key.type : undefined;
  return (
    <>
      <KeyDetails shown={shown} target={target} place="inspector" busy={busy} />
      {type === undefined ? null : (
        <ValueCompact
          where={{ connection: tab.where.connection, database: tab.where.database, key: name, type }}
          busy={busy}
        />
      )}
    </>
  );
}
