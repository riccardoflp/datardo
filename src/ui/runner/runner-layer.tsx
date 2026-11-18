/**
 * What the runner shows above every island: its dialogs one at a time (`nav.dialog`, `runner.ask`,
 * `runner.confirm`), its notifications (`runner.notify`), and the list of work in progress (`runner.progress`).
 */
import { view as dialogView } from '../../features/nav/dialog';
import type { Answers } from '../../shared/feature';
import type { QuestionId } from '../../shared/ids';
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

/** The dialogs, notifications and work in progress of the runner. */
export function RunnerLayer(): React.JSX.Element {
  return (
    <>
      <RunnerDialog />
      <WorkList />
      <Notifications />
    </>
  );
}
