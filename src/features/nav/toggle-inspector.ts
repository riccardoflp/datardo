/**
 * Feature: nav.toggle-inspector
 *
 * Shows or hides the inspector island, giving the page its room, and back; and chooses which of its two views it
 * shows, the selection or the formatting rules. Offered only while the page of the active tab has something to
 * inspect; the views, on a page that offers Formatting. The choices are one for every tab, and are remembered.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { InspectorView } from '../../shared/state/nav';
import { hasSomethingToInspect, offersFormatting, shownView } from './inspector';
import { appPlan, appStep, navInput, startArgs, type NavInput } from './types';

/** Whether **Show inspector** or **Hide inspector** is offered: only while the page has something to inspect. */
export function isOffered(input: NavInput): boolean {
  return hasSomethingToInspect(input.activeTab);
}

/**
 * Whether a view's command is offered: **Formatting rules** on a page that offers Formatting; **Inspect the
 * selection** there while the Formatting view is shown.
 */
export function isViewOffered(input: NavInput, view: InspectorView): boolean {
  if (!offersFormatting(input.activeTab)) {
    return false;
  }
  return view === 'formatting' || (!input.nav.inspectorHidden && shownView(input) === 'formatting');
}

/** A view asked for: `args.view`, or the variant of a command (`formatting`, `selection`), which toggles Formatting. */
interface ViewAsked {
  readonly view: InspectorView;
  /** Formatting asked while it is shown gives the selection: `Ctrl+Shift+F`, **Formatting** in the toolbar. */
  readonly toggle: boolean;
}

function viewAsked(answers: Answers): ViewAsked | undefined {
  const args = answers['args'];
  if (args === 'formatting' || args === 'selection') {
    return { view: args, toggle: args === 'formatting' };
  }
  const { view, toggle } = startArgs(answers);
  return view === 'formatting' || view === 'selection' ? { view, toggle: toggle === true } : undefined;
}

/** The plan of a view asked for: shown, with the island; nothing on a page that does not offer Formatting. */
function viewPlan(input: NavInput, asked: ViewAsked): Outcome {
  if (!offersFormatting(input.activeTab)) {
    return run(appPlan('Choose the view of the inspector island', []));
  }
  const showing = !input.nav.inspectorHidden && shownView(input) === 'formatting';
  const view: InspectorView = asked.view === 'formatting' && asked.toggle && showing ? 'selection' : asked.view;
  const words =
    view === 'formatting'
      ? 'show the Formatting view of the inspector island'
      : 'show the selection in the inspector island';
  const title =
    view === 'formatting'
      ? 'Show the Formatting view of the inspector island'
      : 'Show the selection in the inspector island';
  return run(appPlan(title, [appStep(words, 'nav.set-inspector', { hidden: false, view })]));
}

/** The plan for the nav input given: nothing on a page with nothing to inspect. */
export function planFor(input: NavInput, answers: Answers): Outcome {
  const asked = viewAsked(answers);
  if (asked !== undefined) {
    return viewPlan(input, asked);
  }
  if (!isOffered(input)) {
    return run(appPlan('Show or hide the inspector island', []));
  }
  const hiddenAsked = startArgs(answers)['hidden'];
  const hidden = typeof hiddenAsked === 'boolean' ? hiddenAsked : !input.nav.inspectorHidden;
  const words = hidden ? 'hide the inspector island' : 'show the inspector island';
  const title = hidden ? 'Hide the inspector island' : 'Show the inspector island';
  return run(appPlan(title, [appStep(words, 'nav.set-inspector', { hidden })]));
}

/**
 * Hides the inspector island when it is shown, shows it when it is hidden; `args.hidden` asks for one of the two.
 * `args.view` shows a view of the island, and the island with it; with `args.toggle`, Formatting asked while it is
 * shown gives the selection. The variants `formatting` and `selection` are the commands **Formatting rules** and
 * **Inspect the selection**.
 */
export function plan(context: Context, answers: Answers): Outcome {
  return planFor(navInput(context.state), answers);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('nav.toggle-inspector'), plan };
