/**
 * `nav.dialog`: the one dialog every feature's question, confirmation or View dialog is drawn in. It behaves as the
 * function of `src/features/nav/dialog.ts` says for its kind: modal, the focus kept inside and given back when it
 * closes, `Esc` cancels, a click outside cancels only a list to pick from.
 */
import * as RadixDialog from '@radix-ui/react-dialog';
import { useState, type ReactNode } from 'react';
import { dialogBehavior, type DialogKind } from '../../features/nav/dialog';
import styles from './dialog.module.css';

/** What a dialog is given. */
export interface DialogProps {
  readonly title: string;
  readonly kind: DialogKind;
  /** `Esc`, **Cancel**, and a click outside a list to pick from. */
  readonly onCancel: () => void;
  /** What is asked: the text, the fields, the steps. It scrolls when it does not fit. */
  readonly children: ReactNode;
  /** The buttons at the bottom right, the one that goes on last. They stay in sight. */
  readonly buttons: ReactNode;
}

/** The selector of the control that takes the focus when the dialog opens, which each kind marks. */
export const autoFocusAttribute = 'data-autofocus';

/**
 * Selects the text of the field that takes the focus: all of it, or the part its question names (`logo` of
 * `logo.png`), given as `data-select-start` and `data-select-end`.
 */
function selectStart(input: HTMLInputElement): void {
  const start = Number(input.dataset['selectStart']);
  const end = Number(input.dataset['selectEnd']);
  if (input.dataset['selectStart'] !== undefined && Number.isInteger(start) && Number.isInteger(end)) {
    input.setSelectionRange(start, end);
  } else {
    input.select();
  }
}

/** A dialog over the window, with the rest of the window dimmed. */
export function Dialog({ title, kind, onCancel, children, buttons }: DialogProps): React.JSX.Element {
  const behavior = dialogBehavior(kind);
  const [opener] = useState<Element | null>(() => document.activeElement);
  return (
    <RadixDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles['overlay']} />
        <RadixDialog.Content
          className={styles['dialog']}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            const target = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
              `[${autoFocusAttribute}]`,
            );
            if (target !== null && target !== undefined) {
              event.preventDefault();
              target.focus();
              if (target instanceof HTMLInputElement) {
                selectStart(target);
              }
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            giveFocusBack(opener);
          }}
          onPointerDownOutside={(event) => {
            if (!behavior.closesOnClickOutside) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (!behavior.closesOnClickOutside) {
              event.preventDefault();
            }
          }}
          onKeyDown={(event) => {
            // The window behind takes no key of a command while a dialog is open (nav.dialog).
            if (event.key !== 'Escape' && event.key !== 'Tab') {
              event.stopPropagation();
            }
          }}
        >
          <RadixDialog.Title className={styles['title']}>{title}</RadixDialog.Title>
          <div className={styles['body']}>{children}</div>
          <div className={styles['buttons']}>{buttons}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** The focus goes back to the control that had it, or to the page when that control is gone. */
function giveFocusBack(opener: Element | null): void {
  if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body) {
    opener.focus();
    return;
  }
  const main = document.querySelector<HTMLElement>('main');
  if (main !== null) {
    if (!main.hasAttribute('tabindex')) {
      main.setAttribute('tabindex', '-1');
    }
    main.focus();
  }
}

/** What a button of a dialog is given. */
export interface DialogButtonProps {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly look?: 'plain' | 'primary' | 'danger';
  readonly disabled?: boolean;
  /** `data-feature` of the control: `runner.confirm@dialog`. */
  readonly feature?: string;
  readonly autoFocus?: boolean;
  readonly type?: 'button' | 'submit';
}

/** A button of a dialog: **Cancel**, or the one that goes on, named after what it does. */
export function DialogButton(props: DialogButtonProps): React.JSX.Element {
  const look = props.look ?? 'plain';
  return (
    <button
      type={props.type ?? 'button'}
      className={`${styles['button'] ?? ''} ${styles[look] ?? ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
      data-feature={props.feature}
      {...(props.autoFocus === true ? { [autoFocusAttribute]: '' } : {})}
    >
      {props.children}
    </button>
  );
}
