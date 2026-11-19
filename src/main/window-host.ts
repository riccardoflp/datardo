/**
 * Datardo's one window in the main process: created with the frame of the platform where `window.placement` says,
 * kept a sandbox, mirrored in the state, remembered (`window.remember`), closed through `window.close`, hidden in the
 * tray, shown again, and brought back when its process fails (`window.recover`). The features decide; this carries
 * out what their app steps say, and starts them when the system asks.
 */
import { app, BrowserWindow, type Rectangle } from 'electron';
import type { Intent, IntentResult } from '../shared/bridge';
import type { Platform } from '../shared/feature';
import { featureId } from '../shared/ids';
import { appTarget } from '../shared/target';
import { frame } from '../features/window/frame';
import type { Placement } from '../features/window/placement';
import { isOtherWorkInProgress } from '../features/window/quit';
import { rememberDelayMs } from '../features/window/remember';
import type { AppStateHolder } from './app-state';
import { applyTheme, applyZoom } from './window-look';
import { guardTheWindow } from './window-guard';
import { windowOptions } from './window-options';
import type { WindowPlace } from './window-place';
import { watchTheWindowProcess } from './window-recover';
import { TrayIcon } from './tray';

/** What the window needs from the rest of the main process. */
export interface WindowHostSetup {
  readonly platform: Platform;
  readonly holder: AppStateHolder;
  readonly place: WindowPlace;
  /** The path of the bridge's script. */
  readonly preload: string;
  /** Loads Datardo's page in the window. */
  readonly load: (window: BrowserWindow) => Promise<void>;
  /** Starts a feature through the runner. */
  readonly start: (intent: Intent) => Promise<IntentResult>;
  /** Writes a line in the Log for a feature of the window area. */
  readonly log: (feature: string, text: string) => void;
  /** The window was closed: what waited for it is cancelled. */
  readonly onClosed: () => void;
}

function intent(feature: string, args?: Intent['args']): Intent {
  return { feature: featureId(feature), target: appTarget, ...(args === undefined ? {} : { args }) };
}

/** The largest number of pixels the system adds to a side of a window it is given (at 125% scaling on Windows, 2). */
const mostAdded = 3;

function sameBounds(a: Rectangle, b: Rectangle): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Gives the window exactly the bounds it was left with (`window.remember`). With a scaling that is not a whole number,
 * Windows rounds the size of a window without a frame up by a pixel or two each time it is set, so a window opened
 * with the size it was saved with would grow at each start; the size is then set a little smaller until the window
 * reports the size wanted, or left at the nearest one.
 */
function placeExactly(window: BrowserWindow, wanted: Rectangle): void {
  if (sameBounds(window.getBounds(), wanted)) {
    return;
  }
  let nearest: { readonly bounds: Rectangle; readonly off: number } | undefined;
  for (let lessWidth = 0; lessWidth <= mostAdded; lessWidth += 1) {
    for (let lessHeight = 0; lessHeight <= mostAdded; lessHeight += 1) {
      const tried = { ...wanted, width: wanted.width - lessWidth, height: wanted.height - lessHeight };
      window.setBounds(tried);
      const got = window.getBounds();
      if (sameBounds(got, wanted)) {
        return;
      }
      const off = Math.abs(got.width - wanted.width) + Math.abs(got.height - wanted.height);
      if (nearest === undefined || off < nearest.off) {
        nearest = { bounds: tried, off };
      }
    }
  }
  if (nearest !== undefined) {
    window.setBounds(nearest.bounds);
  }
}

/** The window, from start to quit. */
export class WindowHost {
  private setup: WindowHostSetup | undefined;
  private window: BrowserWindow | undefined;
  private tray: TrayIcon | undefined;
  private rememberTimer: ReturnType<typeof setTimeout> | undefined;
  private quitting = false;
  private closing = false;

  /** Gives the window what it needs; called once, when Datardo is ready. */
  configure(setup: WindowHostSetup): void {
    this.setup = setup;
    this.tray = new TrayIcon(setup.platform, (intents) => {
      void this.startInOrder(intents);
    });
  }

  /** The window, while it exists. */
  current(): BrowserWindow | undefined {
    return this.window !== undefined && !this.window.isDestroyed() ? this.window : undefined;
  }

  /** Whether the window is shown, and not hidden in the tray. */
  isShown(): boolean {
    return this.current()?.isVisible() ?? false;
  }

  /** Whether Datardo is quitting: the window then closes without asking. */
  isQuitting(): boolean {
    return this.quitting;
  }

  /** Creates the window where `window.placement` says, in the theme of the settings, and loads Datardo's page. */
  async open(): Promise<void> {
    const setup = this.need();
    const theme = applyTheme(setup.holder);
    const placement = setup.place.initial();
    const window = new BrowserWindow(windowOptions(setup.preload, frame(setup.platform, theme), placement));
    placeExactly(window, { x: placement.left, y: placement.top, width: placement.width, height: placement.height });
    this.window = window;
    if (setup.platform !== 'macos') {
      window.removeMenu();
    }
    setup.holder.mirrorTo(window);
    guardTheWindow(window, (asked) => void setup.start(asked));
    this.watch(window, setup);
    if (placement.maximized) {
      window.maximize();
    }
    window.once('ready-to-show', () => {
      window.show();
    });
    window.webContents.on('did-finish-load', () => {
      applyZoom(window, setup.holder.get());
    });
    window.webContents.on('zoom-changed', () => {
      // Chromium's own zoom never applies: the zoom is the setting's, which `window.zoom` changes.
      applyZoom(window, setup.holder.get());
    });
    await setup.load(window);
  }

  /** Shows the window: from the tray, minimized, or created again when its process was gone in the tray. */
  async show(): Promise<void> {
    this.tray?.hide();
    const window = this.current();
    if (window === undefined) {
      await this.open();
      return;
    }
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
  }

  /** Brings the window to the front and gives it the focus. */
  focus(): void {
    const window = this.current();
    if (window !== undefined) {
      window.moveTop();
      window.focus();
    }
  }

  /** Hides the window: it goes to the tray. */
  hide(): void {
    this.current()?.hide();
  }

  /** Shows the tray icon. */
  showTray(): void {
    this.tray?.show(this.need().holder.get());
  }

  /** Saves the window's place now (`window.remember`). */
  async remember(): Promise<void> {
    const saved = this.placementNow();
    if (saved !== undefined) {
      await this.need().start(intent('window.remember', { ...saved }));
    }
  }

  /**
   * The window's place as `window.remember` saves it: the bounds it has when not maximized, and whether it is. Full
   * screen and a minimized window are not remembered: what was saved before stays.
   */
  placementNow(): Placement | undefined {
    const window = this.current();
    if (window === undefined || window.isFullScreen() || window.isMinimized()) {
      return undefined;
    }
    const bounds = window.getNormalBounds();
    return {
      left: bounds.x,
      top: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: window.isMaximized(),
    };
  }

  /**
   * Quits once the work in progress cancelled by the plan has stopped, waiting for it up to `waitMs`: the window's
   * place is saved, the tray icon removed, and the stores are written at `will-quit`.
   */
  async quit(waitMs: number): Promise<void> {
    // Saved here rather than by a plan of `window.remember`, which would wait for this quit to end.
    const saved = this.placementNow();
    if (saved !== undefined) {
      await this.need().place.save(saved);
    }
    this.quitting = true;
    await this.workEnded(waitMs);
    this.tray?.hide();
    app.quit();
  }

  /** Quits without asking anything: the window is gone, or the system is shutting down. */
  quitAtOnce(): void {
    this.quitting = true;
    this.tray?.hide();
    app.quit();
  }

  /** The system asks Datardo to quit (the Dock, a logout): the quit asks what it must, once. */
  askToQuit(): void {
    if (!this.quitting) {
      void this.startOnce(intent('window.quit'));
    }
  }

  /** What the window was given at start; throws before Datardo is ready. */
  need(): WindowHostSetup {
    if (this.setup === undefined) {
      throw new Error('The window was used before Datardo was ready.');
    }
    return this.setup;
  }

  private async startInOrder(intents: readonly Intent[]): Promise<void> {
    for (const each of intents) {
      await this.need().start(each);
    }
  }

  /** Starts a close or a quit, unless one is already asking (`window.quit`). */
  private async startOnce(asked: Intent): Promise<void> {
    if (this.closing) {
      return;
    }
    this.closing = true;
    try {
      await this.need().start(asked);
    } finally {
      this.closing = false;
    }
  }

  private workEnded(waitMs: number): Promise<void> {
    const holder = this.need().holder;
    const isIdle = (): boolean => !holder.get().runner.work.some(isOtherWorkInProgress);
    if (isIdle()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const timer = setTimeout(done, waitMs);
      const stop = holder.listen(() => {
        if (isIdle()) {
          done();
        }
      });
      function done(): void {
        clearTimeout(timer);
        stop();
        resolve();
      }
    });
  }

  private rememberSoon(): void {
    if (this.rememberTimer !== undefined) {
      clearTimeout(this.rememberTimer);
    }
    this.rememberTimer = setTimeout(() => {
      this.rememberTimer = undefined;
      void this.remember();
    }, rememberDelayMs);
  }

  private watch(window: BrowserWindow, setup: WindowHostSetup): void {
    const tell = (): void => {
      setup.holder.dispatch({
        slice: 'window',
        type: 'changed',
        window: { maximized: window.isMaximized(), fullScreen: window.isFullScreen(), focused: window.isFocused() },
      });
    };
    for (const name of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'focus', 'blur'] as const) {
      window.on(name as 'maximize', tell);
    }
    window.on('move', () => {
      this.rememberSoon();
    });
    window.on('resize', () => {
      this.rememberSoon();
    });
    window.on('maximize', () => void this.remember());
    window.on('unmaximize', () => void this.remember());
    window.on('close', (event) => {
      this.closed(event);
    });
    window.on('session-end', () => {
      // Windows is shutting down and gives no time to answer: Datardo quits without the answers.
      this.quitAtOnce();
    });
    window.on('closed', () => {
      this.window = undefined;
      setup.onClosed();
    });
    this.recover(window, setup);
  }

  private closed(event: Electron.Event): void {
    if (this.quitting) {
      return;
    }
    event.preventDefault();
    void this.remember();
    void this.startOnce(intent('window.close'));
  }

  private recover(window: BrowserWindow, setup: WindowHostSetup): void {
    watchTheWindowProcess(window, {
      window: () => this.current(),
      isShown: () => this.isShown(),
      isQuitting: () => this.quitting,
      log: (text) => {
        setup.log('window.recover', text);
      },
      reload: () => {
        this.current()?.webContents.reload();
      },
      quitAtOnce: () => {
        this.quitAtOnce();
      },
      forget: () => {
        const gone = this.current();
        this.window = undefined;
        gone?.destroy();
      },
      now: () => Date.now(),
    });
  }
}

/** Datardo's one window. */
export const windowHost = new WindowHost();
