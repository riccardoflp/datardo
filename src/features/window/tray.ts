/**
 * Feature: window.tray
 *
 * While Datardo runs without its window, an icon in the system's tray says so and brings the window back. There is
 * no icon while the window is shown.
 */
import type { Intent } from '../../shared/bridge';
import { featureId } from '../../shared/ids';
import { appTarget } from '../../shared/target';
import type { AppState } from '../../shared/state';
import { workToCancel } from './quit';
import { windowText } from './text';

/** An entry of the tray icon's menu. */
export type TrayEntry =
  | {
      readonly kind: 'command';
      readonly title: string;
      /** The identifier of the control, for an entry whose card lists the place `@tray`. */
      readonly element?: string;
      readonly intents: readonly Intent[];
    }
  | { readonly kind: 'separator' };

/** The tray icon: its text when the pointer rests on it, its menu, and what a click on it does. */
export interface TrayView {
  readonly tooltip: string;
  /** The icon's size, in pixels. */
  readonly iconSize: number;
  readonly entries: readonly TrayEntry[];
  /** What a click on the icon does on Windows and Linux; on macOS it opens the menu. */
  readonly click: readonly Intent[];
}

function intent(feature: string): Intent {
  return { feature: featureId(feature), target: appTarget, place: 'tray' };
}

/** Showing the window, as starting Datardo again does (`window.single-instance`). */
const showWindow = intent('window.single-instance');

/**
 * Feature: window.tray
 *
 * **Open Datardo**, **Scheduled tasks**, a separator and **Quit**, in this order. **Quit** shows the window first
 * when the quit has something to ask (`window.quit`).
 */
export function view(state: AppState): TrayView {
  const quit = intent('window.quit');
  const quitAsks = workToCancel(state.runner.work).length > 0;
  return {
    tooltip: windowText.trayTooltip,
    iconSize: 16,
    entries: [
      { kind: 'command', title: windowText.trayOpen, intents: [showWindow] },
      { kind: 'command', title: windowText.trayTasks, intents: [showWindow, intent('task.show')] },
      { kind: 'separator' },
      {
        kind: 'command',
        title: windowText.trayQuit,
        element: 'window.quit@tray',
        intents: quitAsks ? [showWindow, quit] : [quit],
      },
    ],
    click: [showWindow],
  };
}
