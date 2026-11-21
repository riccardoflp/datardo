/**
 * What the runner shows above every island: its dialogs one at a time (`nav.dialog`, `runner.ask`,
 * `runner.confirm`), a question drawn by its feature's own dialog (the insert dialog and the form of **Update many**
 * of the document area), its notifications (`runner.notify`), and the list of work in progress (`runner.progress`).
 */
import { useEffect } from 'react';
import { view as dialogView } from '../../features/nav/dialog';
import type { Answers } from '../../shared/feature';
import type { QuestionId } from '../../shared/ids';
import { InsertDialog } from '../pages/document/insert-dialog';
import { followInsert } from '../pages/document/insert-memory';
import { UpdateForm } from '../pages/document/update-form';
import { isUserDialog, UserDialog } from '../pages/user/user-dialogs';
import { useAppState } from '../state/store';
import { ConfirmationDialog } from './confirmation-dialog';
import { Notifications } from './notifications';
import { QuestionDialog } from './question-dialog';
import { WorkList } from './work-list';

function answer(id: QuestionId, answers: Answers | undefined): void {
  void window.datardo.answer({ id, answers });
}

/** The dialog shown: the first the runner asked for; the others wait. */
function RunnerDialog(): React.JSX.Element | null {
  const state = useAppState();
  const shown = dialogView(state.runner);
  const dialog = shown.shown;
  if (dialog === undefined || shown.behavior === undefined) {
    return null;
  }
  if (dialog.kind === 'question') {
    const onAnswer = (answers: Answers | undefined): void => {
      answer(dialog.id, answers);
    };
    // A question a feature's own dialog draws: the insert dialog, the form of Update many.
    if (dialog.question.element === 'document.insert@dialog') {
      return <InsertDialog key={dialog.id} question={dialog.question} onAnswer={onAnswer} />;
    }
    if (dialog.question.element === 'document.update-many@form') {
      return <UpdateForm key={dialog.id} question={dialog.question} onAnswer={onAnswer} />;
    }
    if (isUserDialog(dialog.feature)) {
      return <UserDialog key={dialog.id} feature={dialog.feature} question={dialog.question} onAnswer={onAnswer} />;
    }
    return (
      <QuestionDialog
        key={dialog.id}
        question={dialog.question}
        kind={shown.behavior.kind === 'pick' ? 'pick' : 'form'}
        onAnswer={(answers) => {
          answer(dialog.id, answers);
        }}
      />
    );
  }
  return (
    <ConfirmationDialog
      key={dialog.id}
      confirmation={dialog.confirmation}
      onDecide={(confirmed) => {
        answer(dialog.id, confirmed ? {} : undefined);
      }}
    />
  );
}

/** Follows the notifications of an insert sent by the insert dialog, which opens again when it failed. */
function useInsertFollowed(): void {
  const last = useAppState().runner.notifications.at(-1);
  useEffect(() => {
    followInsert(last);
  }, [last]);
}

/** The dialogs, notifications and work in progress of the runner. */
export function RunnerLayer(): React.JSX.Element {
  useInsertFollowed();
  return (
    <>
      <RunnerDialog />
      <WorkList />
      <Notifications />
    </>
  );
}
