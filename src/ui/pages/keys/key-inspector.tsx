/**
 * `key.inspect`: the selected key in the inspector island, drawn from its View: the name with **Copy name**, its type,
 * expiry (counted again every second), size and encoding, the line of a module's type, and the buttons of what can be
 * done to it, then its value in the compact form (`value.show`). It is read 150 ms after the selection settles, and
 * again after every refresh of its tab.
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

function ActionButton(props: { readonly button: InspectButton; readonly target: Target; readonly place: Place }) {
  return (
    <button
      type="button"
      className={styles['button']}
      data-feature={props.button.element}
      onClick={() => {
        startFeature(props.button.feature, { place: props.place, target: props.target });
      }}
    >
      {props.button.label}
    </button>
  );
}

/** What `key.inspect` shows of one key, with its buttons started on `target` from `place`. */
export function KeyDetails(props: {
  readonly shown: InspectView;
  readonly target: Target;
  readonly place: Place;
  readonly buttons?: boolean;
}): React.JSX.Element {
  const { shown, target, place } = props;
  return (
    <div className={styles['inspected']} aria-busy={shown.loading === true ? true : undefined}>
      <div className={styles['name']}>{shown.name}</div>
      {props.buttons === false ? null : (
        <div className={styles['buttons']}>
          <ActionButton button={shown.copyName} target={target} place={place} />
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
                <ActionButton key={button.element} button={button} target={target} place={place} />
              ))}
            </dd>
          </div>
        ))}
      </dl>
      {shown.value?.kind === 'module' ? <p>{shown.value.text}</p> : null}
      {props.buttons === false ? null : (
        <div className={styles['buttons']}>
          {shown.buttons.map((button) => (
            <ActionButton key={button.element} button={button} target={target} place={place} />
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
  const readFor = tab?.inspected?.key;
  useEffect(() => {
    if (keyHex === undefined || readFor === keyHex) {
      return undefined;
    }
    const timer = setTimeout(() => {
      void readInspected(tabId, keyHex);
    }, settleMs);
    return () => {
      clearTimeout(timer);
    };
  }, [tabId, keyHex, readFor]);
  const name = keyHex === undefined ? undefined : bytesOfHex(keyHex);
  if (tab === undefined || name === undefined) {
    return null;
  }
  const inspected = tab.inspected;
  const read: InspectRead = inspected !== undefined && inspected.key === keyHex ? inspected.read : { kind: 'loading' };
  const shown = view({ name, readOnly: factsOf(app, tab.where.connection).readOnly, read, now });
  const target: Target = { kind: 'key', connection: tab.where.connection, database: tab.where.database, key: name };
  const type = read.kind === 'loaded' && shown.value?.kind === 'value' ? read.key.type : undefined;
  return (
    <>
      <KeyDetails shown={shown} target={target} place="inspector" />
      {type === undefined ? null : (
        <ValueCompact where={{ connection: tab.where.connection, database: tab.where.database, key: name, type }} />
      )}
    </>
  );
}
