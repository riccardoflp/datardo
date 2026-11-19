/**
 * Feature: value.refresh — reads the key and its value again, as they are now: the pages loaded are dropped and the
 * view reads the key's lines, the count and the first page again, with the same filter, order and range. With
 * changes typed and not saved, it asks first whether to discard them.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { activeTabOf } from '../../shared/state/tabs';
import { copyText } from './text';
import { keyOf, nameText } from './types';

/** Whether the active tab is a key tab with changes typed and not saved. */
function hasUnsavedChanges(context: Context, answers: Answers): boolean {
  const tab = activeTabOf(context.state.tabs);
  return answers['unsaved'] === true || (tab?.shows.kind === 'key' && tab.unsaved === true);
}

/**
 * Feature: value.refresh — no step on the deployment: the view reads the value again. With unsaved changes the
 * confirmation **Discard your changes to orders:42?** comes first, with the button **Discard**.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const at = keyOf(context);
  const name = nameText(at.key);
  const unsaved = hasUnsavedChanges(context, answers);
  return run({
    title: unsaved ? copyText.discard(name) : copyText.refreshTitle,
    steps: [],
    danger: unsaved ? { kind: 'confirm', text: '', button: copyText.discardButton } : noDanger,
    undo: { cannot: copyText.nothingToUndo },
    publishes: false,
    after: [{ kind: 'refresh', connection: at.connection }],
  });
}
