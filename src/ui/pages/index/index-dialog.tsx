/**
 * The index dialog (`index.dialog`, `@dialog`) that `index.create`, `index.duplicate` and `index.edit` ask through:
 * the switch **Form** / **Text**, the parts of the mode shown, **Command**, the warnings, the note and the error, then
 * **Copy command**, **Cancel** and **Create index** or **Save changes** (`Ctrl+Enter`). Once answered it stays drawn,
 * locked, with **Creating…** or **Saving…** and **Close**, until its plan ends (`dialog-memory`).
 */
import { useState } from 'react';
import {
  dialogAnswers,
  dialogDefinition,
  switchedMode,
  view,
  type IndexDialogState,
} from '../../../features/index/dialog';
import { dialogOfQuestion, type DialogAbout } from '../../../features/index/parts/dialog-question';
import { text } from '../../../features/index/text';
import type { Answers } from '../../../shared/feature';
import { Dialog, DialogButton } from '../../shell/dialog';
import { closeAnswered, dialogAnswered, dialogKey, reopeningOf } from './dialog-memory';
import { useFieldHints } from './field-hints';
import { FieldsPart, OptionsPart, TextPart, type DialogPartProps } from './index-dialog-form';
import styles from './index.module.css';

function ModeSwitch(props: DialogPartProps): React.JSX.Element {
  const button = (mode: 'form' | 'text'): React.JSX.Element => (
    <button
      type="button"
      className={styles['button']}
      aria-pressed={props.state.mode === mode}
      title={mode === 'form' ? text.dialog.formHint : text.dialog.textHint}
      disabled={props.shown.locked}
      onClick={() => {
        props.change(switchedMode(props.state, mode));
      }}
    >
      {mode === 'form' ? text.dialog.form : text.dialog.text}
    </button>
  );
  return (
    <div className={styles['modes']} role="group" aria-label={text.dialog.modes}>
      {button('form')}
      {button('text')}
    </div>
  );
}

function Lines(props: DialogPartProps): React.JSX.Element {
  const { shown } = props;
  return (
    <>
      <div className={styles['option']}>
        <span>{text.dialog.command}</span>
        <pre className={styles['command']}>{shown.command}</pre>
      </div>
      {shown.warnings.map((warning) => (
        <p key={warning} className={styles['warning']}>
          {warning}
        </p>
      ))}
      {shown.note === undefined ? null : (
        <p className={styles['note']} role="status">
          {shown.note}
        </p>
      )}
      {shown.error === undefined ? null : (
        <p className={styles['dialog-problem']} role="alert">
          {shown.error}
        </p>
      )}
    </>
  );
}

interface FrameProps {
  readonly state: IndexDialogState;
  readonly change: (state: IndexDialogState) => void;
  readonly save: () => void;
  readonly cancel: () => void;
  readonly where: { readonly connection: string; readonly database: string; readonly collection: string };
}

/** The dialog drawn from its state, for a question or while its plan runs. */
function IndexDialogFrame(props: FrameProps): React.JSX.Element {
  const shown = view(props.state);
  const fields = useFieldHints(props.where) ?? [];
  const part: DialogPartProps = { state: props.state, shown, fields, change: props.change, save: props.save };
  return (
    <Dialog
      title={shown.title}
      kind="form"
      onCancel={props.cancel}
      buttons={
        <>
          <DialogButton
            disabled={!shown.copyEnabled}
            onClick={() => {
              void navigator.clipboard.writeText(shown.command);
            }}
          >
            {text.dialog.copy}
          </DialogButton>
          <span title={shown.cancel.hint}>
            <DialogButton onClick={props.cancel}>{shown.cancel.label}</DialogButton>
          </span>
          <DialogButton
            feature="index.dialog@dialog"
            look="primary"
            disabled={!shown.main.enabled}
            onClick={props.save}
          >
            {shown.main.label}
          </DialogButton>
        </>
      }
    >
      <div
        className={styles['dialog']}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            props.save();
          }
        }}
      >
        <ModeSwitch {...part} />
        {shown.mode === 'form' ? (
          <>
            <FieldsPart {...part} />
            <OptionsPart {...part} />
          </>
        ) : (
          <TextPart {...part} />
        )}
        <Lines {...part} />
      </div>
    </Dialog>
  );
}

/** What the question dialog is given. */
export interface IndexQuestionDialogProps {
  readonly about: DialogAbout;
  readonly onAnswer: (answers: Answers | undefined) => void;
}

function opened(about: DialogAbout): IndexDialogState {
  const kept = reopeningOf('index', dialogKey(about));
  if (kept === undefined) {
    return dialogOfQuestion(about);
  }
  return about.list === undefined ? kept : { ...kept, list: about.list };
}

/** The index dialog of a question the runner asks. */
export function IndexQuestionDialog({ about, onAnswer }: IndexQuestionDialogProps): React.JSX.Element {
  const [state, setState] = useState(() => opened(about));
  const save = (): void => {
    const shown = view(state);
    if (!shown.main.enabled) {
      return;
    }
    const answers = dialogAnswers(state);
    if (answers === undefined) {
      const read = dialogDefinition(state);
      setState({ ...state, ...(read.kind === 'error' ? { error: read.message } : {}) });
      return;
    }
    const { error: _error, ...rest } = state;
    const where = { connection: about.connection, database: about.database, collection: about.collection };
    dialogAnswered({ kind: 'index', key: dialogKey(about), where, state: { ...rest, busy: true } });
    onAnswer(answers);
  };
  return (
    <IndexDialogFrame
      state={state}
      change={setState}
      save={save}
      cancel={() => {
        onAnswer(undefined);
      }}
      where={about}
    />
  );
}

/** The index dialog answered, while its plan runs: locked, with **Close**. */
export function AnsweredIndexDialog({
  state,
  where,
}: {
  readonly state: IndexDialogState;
  readonly where: FrameProps['where'];
}): React.JSX.Element {
  return (
    <IndexDialogFrame
      state={state}
      change={() => undefined}
      save={() => undefined}
      cancel={closeAnswered}
      where={where}
    />
  );
}
