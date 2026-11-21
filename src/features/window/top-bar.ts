/**
 * Feature: window.top-bar
 *
 * The strip at the top of the window: the app's name, the **Go to** field, the state of the MCP server and the
 * window's buttons. Its empty part moves the window.
 */
import type { Intent } from '../../shared/bridge';
import { featureId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { appTarget } from '../../shared/target';
import { view as mcpStatus, type StatusDot } from '../mcp/status';
import { frame, topBarHeight } from './frame';
import { appName, windowText } from './text';
import { zoomInUse } from './zoom';

/** One of Datardo's own window's buttons, on Linux. */
export interface WindowButton {
  readonly name: string;
  readonly icon: 'minimize' | 'maximize' | 'restore' | 'close' | 'exit-full-screen';
  readonly element: string;
  readonly intent: Intent;
}

/** What the top bar shows, from left to right. */
export interface TopBarView {
  readonly height: number;
  /**
   * The room left free for the system's buttons, in pixels of the page: the system's buttons keep their size whatever
   * the zoom, so the room is divided by it.
   */
  readonly room: { readonly left: number; readonly right: number };
  readonly name: string;
  readonly goTo: {
    readonly label: string;
    readonly placeholder: string;
    readonly key: string;
    readonly element: string;
    readonly intent: Intent;
    /** False while a dialog is open: the field does not answer. */
    readonly enabled: boolean;
  };
  readonly mcp: {
    readonly text: string;
    /** The state of the server in words (`mcp.status`): the tooltip, and the name a screen reader says. */
    readonly label: string;
    /** The dot of the state, which the label also tells: never the color alone. */
    readonly dot: StatusDot;
    readonly element: string;
    /** The element of the state itself, its dot (`mcp.status@top-bar`). */
    readonly stateElement: 'mcp.status@top-bar';
    readonly intent: Intent;
    readonly enabled: boolean;
  };
  /** Datardo's own buttons: on Linux only; one, **Exit full screen**, in full screen. */
  readonly buttons: readonly WindowButton[];
}

function intent(feature: string, args?: string): Intent {
  return {
    feature: featureId(feature),
    target: appTarget,
    place: 'top-bar',
    ...(args === undefined ? {} : { args }),
  };
}

function linuxButtons(state: AppState): readonly WindowButton[] {
  const { maximized, fullScreen } = state.window;
  if (fullScreen) {
    return [
      {
        name: windowText.exitFullScreen,
        icon: 'exit-full-screen',
        element: 'window.full-screen@top-bar',
        intent: intent('window.full-screen'),
      },
    ];
  }
  return [
    {
      name: windowText.minimize,
      icon: 'minimize',
      element: 'window.size@top-bar',
      intent: intent('window.size', 'minimize'),
    },
    maximized
      ? {
          name: windowText.restore,
          icon: 'restore',
          element: 'window.size@top-bar',
          intent: intent('window.size', 'restore'),
        }
      : {
          name: windowText.maximize,
          icon: 'maximize',
          element: 'window.size@top-bar',
          intent: intent('window.size', 'maximize'),
        },
    { name: windowText.close, icon: 'close', element: 'window.close@top-bar', intent: intent('window.close') },
  ];
}

/**
 * Feature: window.top-bar
 *
 * On macOS the room of the system's buttons; Datardo's icon and name; the **Go to** field; the MCP state; the
 * window's buttons (the system's on Windows, Datardo's on Linux, none on macOS). A dialog that is open makes the field
 * and the MCP state not answer.
 */
export function view(state: AppState): TopBarView {
  const { platform } = state.app;
  const theFrame = frame(platform, state.window.dark ? 'dark' : 'light');
  const zoom = zoomInUse(state.settings) / 100;
  const inFullScreen = state.window.fullScreen && platform !== 'linux';
  const enabled = state.runner.dialogs.length === 0;
  const status = mcpStatus(state);
  return {
    height: topBarHeight,
    room: inFullScreen ? { left: 0, right: 0 } : { left: theFrame.room.left / zoom, right: theFrame.room.right / zoom },
    name: appName,
    goTo: {
      label: windowText.goToLabel,
      placeholder: windowText.goToPlaceholder,
      key: platform === 'macos' ? 'Cmd+K' : windowText.goToKey,
      element: 'palette.open@top-bar',
      intent: intent('palette.open'),
      enabled,
    },
    mcp: {
      text: status.label,
      label: status.tooltip,
      dot: status.dot,
      // A click opens the setup of the server (mcp.status, mcp.setup).
      element: status.element,
      stateElement: 'mcp.status@top-bar',
      intent: intent('mcp.setup'),
      enabled,
    },
    buttons: theFrame.buttons === 'datardo' ? linuxButtons(state) : [],
  };
}
