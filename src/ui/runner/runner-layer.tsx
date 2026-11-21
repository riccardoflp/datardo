/**
 * What the runner shows above every island: its dialogs one at a time (`nav.dialog`, `runner.ask`,
 * `runner.confirm`), a question drawn by its feature's own dialog (the insert dialog, the form of **Update many**,
 * the index dialog and the search index dialog, which stay drawn while their plan runs), its notifications
 * (`runner.notify`), and the list of work in progress (`runner.progress`).
 */
import { useEffect } from 'react';
import { view as dialogView } from '../../features/nav/dialog';
import type { Answers } from '../../shared/feature';
import type { QuestionId } from '../../shared/ids';
import { dialogAboutOf, searchDialogAboutOf } from '../../features/index/parts/dialog-question';
import { InsertDialog } from '../pages/document/insert-dialog';
import { useAnswered } from '../pages/index/dialog-memory';
import { AnsweredIndexDialog, IndexQuestionDialog } from '../pages/index/index-dialog';
import { AnsweredSearchDialog, SearchQuestionDialog } from '../pages/index/search-dialog';
import { followInsert } from '../pages/document/insert-memory';
import { UpdateForm } from '../pages/document/update-form';
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
  const answered = useAnswered();
  if (dialog === undefined || shown.behavior === undefined) {
    // An index dialog answered stays drawn, locked, while its plan runs and the runner asks nothing.
    if (answered?.kind === 'index') {
      return <AnsweredIndexDialog state={answered.state} where={answered.where} />;
    }
    return answered?.kind === 'search' ? <AnsweredSearchDialog state={answered.state} /> : null;
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
    const indexAbout = dialogAboutOf(dialog.question);
    if (indexAbout !== undefined) {
      return <IndexQuestionDialog key={dialog.id} about={indexAbout} onAnswer={onAnswer} />;
    }
    const searchAbout = searchDialogAboutOf(dialog.question);
    if (searchAbout !== undefined) {
      return <SearchQuestionDialog key={dialog.id} about={searchAbout} onAnswer={onAnswer} />;
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
