/**
 * `window.about`: the dialog that says which Datardo this is, and where its documentation and its data are. It draws
 * what `src/features/window/about.ts` returns. Go to, the Settings page and the menu bar on macOS open it with
 * {@link openAbout}, or, from the main process, by counting `state.window.aboutAsked` up.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { copiedMs, view, type AboutLink } from '../../features/window/about';
import { Dialog, DialogButton } from '../shell/dialog';
import { AppIcon } from '../shell/top-bar/app-icon';
import { startIntent } from '../shell/top-bar/start';
import { useAppState } from '../state/store';
import styles from './about.module.css';

let open = false;
const listeners = new Set<() => void>();

function setOpen(value: boolean): void {
  open = value;
  for (const listener of listeners) {
    listener();
  }
}

/** Opens About. */
export function openAbout(): void {
  setOpen(true);
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

function Link({ link }: { readonly link: AboutLink }): React.JSX.Element {
  return (
    <button
      type="button"
      className={styles['link']}
      data-feature={link.element}
      onClick={() => {
        startIntent(link.intent);
      }}
    >
      {link.title}
    </button>
  );
}

/** **Copy**, which reads **Copied** for a moment after it copied. */
function CopyButton({ text, copy, copied }: { text: string; copy: string; copied: string }): React.JSX.Element {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setDone(false);
    }, copiedMs);
    return () => {
      clearTimeout(timer);
    };
  }, [done]);
  return (
    <DialogButton
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => {
            setDone(true);
          },
          (error: unknown) => {
            // The system refused the clipboard: the button keeps its name, and nothing else changes.
            console.warn('Could not copy:', error);
          },
        );
      }}
    >
      <span aria-live="polite">{done ? copied : copy}</span>
    </DialogButton>
  );
}

/** About Datardo, while it is open. */
export function AboutDialog(): React.JSX.Element | null {
  const state = useAppState();
  const isOpen = useOpen();
  const asked = state.window.aboutAsked;
  useEffect(() => {
    if (asked > 0) {
      openAbout();
    }
  }, [asked]);
  if (!isOpen) {
    return null;
  }
  const about = view(state);
  const close = (): void => {
    setOpen(false);
  };
  return (
    <Dialog
      title={about.title}
      kind="form"
      onCancel={close}
      buttons={
        <>
          <CopyButton text={about.copyText} copy={about.copy} copied={about.copied} />
          <DialogButton look="primary" onClick={close} autoFocus>
            {about.close}
          </DialogButton>
        </>
      }
    >
      <div className={styles['heading']}>
        <AppIcon large />
        <p className={styles['name']}>{about.name}</p>
      </div>
      {about.update === undefined ? null : (
        <p className={styles['line']}>
          {about.update.text} {about.update.download === undefined ? null : <Link link={about.update.download} />}
        </p>
      )}
      {about.check === undefined ? null : (
        <p className={styles['line']}>
          <Link link={about.check} />
        </p>
      )}
      <p className={styles['line']}>{about.runtime}</p>
      <p className={styles['line']}>{about.system}</p>
      <div className={styles['folder']}>
        <span className={styles['muted']}>{about.dataFolder.label}</span>
        <code className={styles['path']}>{about.dataFolder.path}</code>
        <Link link={about.dataFolder.open} />
      </div>
      {about.links.length === 0 ? null : (
        <p className={styles['links']}>
          {about.links.map((link) => (
            <Link key={link.title} link={link} />
          ))}
        </p>
      )}
    </Dialog>
  );
}
