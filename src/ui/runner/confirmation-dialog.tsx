/**
 * `runner.confirm`: the confirmation of a dangerous write in the dialog of `nav.dialog`, drawn from what
 * `src/features/runner/confirm.ts` returns: the title, the text, how much it touches, the steps as they will be sent,
 * the line on undo, and for a destructive plan the field where the name of what is lost is typed.
 */
import { useState } from 'react';
import { view } from '../../features/runner/confirm';
import { runnerText } from '../../features/runner/text';
import type { Confirmation } from '../../shared/state/runner';
import { autoFocusAttribute, Dialog, DialogButton } from '../shell/dialog';
import styles from './runner.module.css';

/** What the dialog is given: the confirmation, and where the decision goes. */
export interface ConfirmationDialogProps {
  readonly confirmation: Confirmation;
  readonly onDecide: (confirmed: boolean) => void;
}

/** The confirmation of a plan. Focus starts on **Cancel**, or in the field of a destructive confirmation. */
export function ConfirmationDialog({ confirmation, onDecide }: ConfirmationDialogProps): React.JSX.Element {
  const [typed, setTyped] = useState('');
  const [showAll, setShowAll] = useState(false);
  const shown = view({ confirmation, typed, showAll });
  const destructive = shown.nameField !== undefined;
  return (
    <Dialog
      title={shown.title}
      kind={destructive ? 'destructive' : 'confirm'}
      onCancel={() => {
        onDecide(false);
      }}
      buttons={
        <>
          <DialogButton
            feature="runner.confirm@dialog"
            autoFocus={!destructive}
            onClick={() => {
              onDecide(false);
            }}
          >
            {runnerText.cancel}
          </DialogButton>
          <DialogButton
            feature="runner.confirm@dialog"
            look={shown.buttonLook}
            disabled={!shown.buttonEnabled}
            onClick={() => {
              onDecide(true);
            }}
          >
            {shown.button}
          </DialogButton>
        </>
      }
    >
      {shown.paragraphs.map((paragraph) => (
        <p key={paragraph} className={styles['text']}>
          {paragraph}
        </p>
      ))}
      {shown.touches === undefined ? null : <p className={styles['touches']}>{shown.touches}</p>}
      <ol className={styles['steps']} aria-label="Steps">
        {shown.steps.map((step, index) => (
          <li key={`${String(index)}-${step.text}`} className={styles['step']}>
            {step.group === undefined ? null : <span className={styles['muted']}>{step.group}</span>}
            <code className={styles['code']}>{step.text}</code>
            {step.instead === undefined ? null : (
              <div className={styles['instead']}>
                <span className={styles['muted']}>{runnerText.ifThisFails}</span>
                {step.instead.map((other) => (
                  <code key={other} className={styles['code']}>
                    {other}
                  </code>
                ))}
              </div>
            )}
            {step.goOn === true ? <span className={styles['muted']}>{runnerText.ifThisFailsGoOn}</span> : null}
          </li>
        ))}
      </ol>
      {shown.more === undefined ? null : (
        <button
          type="button"
          className={styles['more']}
          onClick={() => {
            setShowAll(true);
          }}
        >
          {shown.more}
        </button>
      )}
      <p className={styles['undo']}>{shown.undoLine}</p>
      {shown.nameField === undefined ? null : (
        <div className={styles['field']}>
          <label htmlFor="confirm-name">{shown.nameField.label}</label>
          <input
            id="confirm-name"
            className={styles['input']}
            value={typed}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
            onKeyDown={(event) => {
              // In a destructive confirmation `Enter` in the field does nothing: the button is pressed (nav.dialog).
              if (event.key === 'Enter') {
                event.preventDefault();
              }
            }}
            {...{ [autoFocusAttribute]: '' }}
          />
        </div>
      )}
    </Dialog>
  );
}
