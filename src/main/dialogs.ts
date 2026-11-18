/**
 * Opens the runner's questions and confirmations in the window, through the app's state, and waits for the answer the
 * window sends back through the bridge (`runner.ask`, `runner.confirm`).
 */
import type { DialogAnswer } from '../shared/bridge';
import type { Answers } from '../shared/feature';
import type { FeatureId, QuestionId } from '../shared/ids';
import type { Question } from '../shared/question';
import type { Confirmation, OpenDialog } from '../shared/state/runner';
import type { Dialogs, StateHolder } from '../runner/ports';

/** The dialogs the window shows for the runner, and the answers it waits for. */
export class WindowDialogs implements Dialogs {
  private next = 1;
  private readonly waiting = new Map<QuestionId, (answers: Answers | undefined) => void>();

  /** Opens dialogs through `state`. */
  constructor(private readonly state: StateHolder) {}

  readonly ask = (feature: FeatureId, question: Question): Promise<Answers | undefined> =>
    this.open((id) => ({ kind: 'question', id, feature, question }));

  readonly confirm = async (feature: FeatureId, confirmation: Confirmation): Promise<boolean> =>
    (await this.open((id) => ({ kind: 'confirmation', id, feature, confirmation }))) !== undefined;

  /** The window answered, or cancelled when `answers` is undefined. */
  answer(answer: DialogAnswer): void {
    const resolve = this.waiting.get(answer.id);
    if (resolve === undefined) {
      return;
    }
    this.waiting.delete(answer.id);
    this.state.dispatch({ slice: 'runner', type: 'dialog-closed', id: answer.id });
    resolve(answer.answers);
  }

  /** Cancels every dialog still open: the window was closed or reloaded. */
  cancelAll(): void {
    for (const id of [...this.waiting.keys()]) {
      this.answer({ id, answers: undefined });
    }
  }

  private open(dialog: (id: QuestionId) => OpenDialog): Promise<Answers | undefined> {
    const id = `dialog-${String(this.next++)}` as QuestionId;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      this.state.dispatch({ slice: 'runner', type: 'dialog-opened', dialog: dialog(id) });
    });
  }
}
