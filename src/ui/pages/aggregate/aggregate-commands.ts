/**
 * The commands of the pipeline editor, carried out by the window on the active collection tab, the same way for their
 * rows in Go to (`palette.run-command`): **Add stage**, **Move stage left** and **Move stage right** (the stage whose
 * body has the focus), **Clear pipeline**, **Edit pipeline as text** and **as stages**, **Copy pipeline**, **Run
 * pipeline** and **Save pipeline as view…**. On a tab in Find, the tab goes to Aggregate first.
 */
import type { EditorControl } from '../../../features/aggregate/show';
import { text } from '../../../features/aggregate/text';
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import { switchMode } from '../../query/bar-actions';
import { collectionRefOf, type CollectionRef } from '../../query/collection-reads';
import { collectionOf } from '../../query/collection-store';
import { pressControl } from './pipeline-actions';
import { pipelineOf } from './pipeline-store';

/** The commands this module carries out, and the control each one stands for. */
const controls: Readonly<Record<string, EditorControl>> = {
  'aggregate.add-stage': {
    label: text.editor.addStage,
    element: 'aggregate.add-stage@list',
    feature: 'aggregate.add-stage',
  },
  'aggregate.clear': { label: text.toolbar.clear, element: 'aggregate.clear@toolbar', feature: 'aggregate.clear' },
  'aggregate.edit-as-text:text': {
    label: text.toolbar.editAsText,
    element: 'aggregate.edit-as-text@toolbar',
    feature: 'aggregate.edit-as-text',
    args: { to: 'text' },
  },
  'aggregate.edit-as-text:stages': {
    label: text.toolbar.editAsStages,
    element: 'aggregate.edit-as-text@toolbar',
    feature: 'aggregate.edit-as-text',
    args: { to: 'stages' },
  },
  'aggregate.copy': { label: text.toolbar.copy, element: 'aggregate.copy@toolbar', feature: 'aggregate.copy' },
  'aggregate.run': { label: text.toolbar.run, element: 'aggregate.run@toolbar', feature: 'aggregate.run' },
  'aggregate.save-as-view': {
    label: text.toolbar.saveAsView,
    element: 'aggregate.save-as-view@toolbar',
    feature: 'aggregate.save-as-view',
  },
};

/** Whether a command is one of the pipeline editor's, carried out here. */
export function isAggregateCommand(id: string): boolean {
  return id in controls || id === 'aggregate.move-stage:left' || id === 'aggregate.move-stage:right';
}

/** **Move stage left** or **right**: the stage whose body has the focus; with none, nothing moves. */
function moveControl(ref: CollectionRef, to: 'left' | 'right'): EditorControl | undefined {
  const stage = pipelineOf(ref.tab).focused;
  return stage === undefined
    ? undefined
    : {
        label: to === 'left' ? text.editor.moveLeft : text.editor.moveRight,
        element: 'aggregate.move-stage@list',
        feature: 'aggregate.move-stage',
        args: { stage, to },
      };
}

/** Carries out a command of the pipeline editor on the active collection tab; with none, it does nothing. */
export function runAggregateCommand(id: string, state: AppState): void {
  const active = activeTabOf(state.tabs);
  const ref = active === undefined ? undefined : collectionRefOf(active.id);
  if (ref === undefined) {
    return;
  }
  if (collectionOf(ref.tab).query.mode !== 'aggregate') {
    // The switch runs the pipeline already.
    switchMode(ref, 'aggregate');
    if (id === 'aggregate.run') {
      return;
    }
  }
  const control =
    id === 'aggregate.move-stage:left' || id === 'aggregate.move-stage:right'
      ? moveControl(ref, id === 'aggregate.move-stage:left' ? 'left' : 'right')
      : controls[id];
  if (control !== undefined) {
    pressControl(ref, control);
  }
}
