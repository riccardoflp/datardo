/**
 * The part of the app's state about the window itself: what the cards of the window area (M1) decide from and show.
 * The main process sets it from what the system says of the window.
 */

/** The window as the system has it. */
export interface WindowState {
  readonly maximized: boolean;
  readonly fullScreen: boolean;
  readonly focused: boolean;
  /** Whether the window shows the dark theme now: the setting, or the system's colors when it is `system`. */
  readonly dark: boolean;
  /**
   * Whether closing the window keeps Datardo running in the tray, as `task.tray` decides (M26): false until it
   * says otherwise.
   */
  readonly closeKeepsRunning: boolean;
  /** Counts the times About was asked from outside the window (the menu bar on macOS), so that the window opens it. */
  readonly aboutAsked: number;
}

/** The events of this part of the state. */
export type WindowEvent = { readonly slice: 'window'; readonly type: 'changed'; readonly window: Partial<WindowState> };

/** A window that has just opened. */
export const initialWindowState: WindowState = {
  maximized: false,
  fullScreen: false,
  focused: true,
  dark: true,
  closeKeepsRunning: false,
  aboutAsked: 0,
};

/** Changes this part of the state. */
export function reduceWindow(state: WindowState, event: WindowEvent): WindowState {
  return { ...state, ...event.window };
}
