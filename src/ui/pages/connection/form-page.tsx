/**
 * `connection.form`: the app tab where a connection is written. The page draws the form of the active tab; each form
 * tab keeps what is typed in it (`use-connection-form`). `Escape` or **Cancel** closes it without saving.
 */
import { useEffect, useRef } from 'react';
import { openedOf, view } from '../../../features/connection/form';
import type { FormOpened, FormView } from '../../../features/connection/form';
import type { TabId } from '../../../shared/ids';
import { activeTabOf } from '../../../shared/state/tabs';
import { useAppState } from '../../state/store';
import { AddressPart, OplogPart, SettingsPart, type PartProps } from './form-sections';
import { SshPart, TlsPart } from './tunnel-sections';
import { forgetClosedForms, useConnectionForm } from './use-connection-form';
import styles from './connection-pages.module.css';

function focusField(root: HTMLElement | null, name: string): void {
  root?.querySelector<HTMLElement>(`[data-field="${name}"]`)?.focus();
}

/** **Test connection**, **Cancel**, **Save** and **Save and connect**. */
function Buttons(props: {
  readonly buttons: FormView['buttons'];
  readonly test: () => void;
  readonly cancel: () => void;
  readonly save: (connect: boolean) => void;
}): React.JSX.Element {
  const { test, cancel, save, saveAndConnect } = props.buttons;
  return (
    <div className={styles['buttons']}>
      <button
        type="button"
        className={styles['button']}
        data-feature={test.element}
        disabled={test.disabled}
        onClick={props.test}
      >
        {test.label}
      </button>
      <button type="button" className={styles['button']} disabled={cancel.disabled} onClick={props.cancel}>
        {cancel.label}
      </button>
      <button
        type="button"
        className={styles['button']}
        data-feature={save.element}
        disabled={save.disabled}
        onClick={() => {
          props.save(false);
        }}
      >
        {save.label}
      </button>
      <button
        type="button"
        className={styles['primary']}
        data-feature={saveAndConnect.element}
        disabled={saveAndConnect.disabled}
        onClick={() => {
          props.save(true);
        }}
      >
        {saveAndConnect.label}
      </button>
    </div>
  );
}

function FormTab({ tab, opened }: { readonly tab: TabId; readonly opened: FormOpened }): React.JSX.Element {
  const form = useConnectionForm(tab, opened);
  const shown = view(form.state);
  const root = useRef<HTMLFormElement>(null);
  const busy = form.state.busy !== undefined;
  useEffect(() => {
    focusField(root.current, shown.focus);
    // The focus moves when the tab opens and when a refusal marks another field.
  }, [shown.focus, form.state.result]);
  const enter = (): void => {
    if (!busy) {
      form.save(false);
    }
  };
  const part: PartProps = {
    view: shown,
    form: form.state.form,
    set: form.change,
    enter,
    browse: form.browse,
    leaveString: form.leaveString,
    redisMode: form.redisMode,
  };
  return (
    <form
      ref={root}
      className={styles['form']}
      aria-label={shown.heading}
      onSubmit={(event) => {
        event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          form.cancel();
        }
      }}
    >
      <h1 className={styles['heading']}>
        {shown.heading} <span className={styles['engine']}>{shown.engine}</span>
      </h1>
      <AddressPart {...part} />
      <SettingsPart {...part} />
      <TlsPart {...part} />
      <SshPart {...part} />
      <OplogPart {...part} />
      {shown.message === undefined ? null : (
        <p className={styles[shown.message.ok ? 'success' : 'error']} role={shown.message.ok ? 'status' : 'alert'}>
          {shown.message.text}
        </p>
      )}
      {shown.noKeychain === undefined ? null : <p className={styles['warning']}>{shown.noKeychain}</p>}
      <Buttons buttons={shown.buttons} test={form.test} cancel={form.cancel} save={form.save} />
    </form>
  );
}

/** The connection form of the active tab. */
export function ConnectionFormPage(): React.JSX.Element | null {
  const state = useAppState();
  const active = activeTabOf(state.tabs);
  const opened = active === undefined ? undefined : openedOf(active.shows, state.connections);
  useEffect(() => {
    forgetClosedForms(state.tabs.tabs.map((tab) => tab.id));
  }, [state.tabs.tabs]);
  if (active === undefined || opened === undefined) {
    return null;
  }
  return <FormTab key={active.id} tab={active.id} opened={opened} />;
}
