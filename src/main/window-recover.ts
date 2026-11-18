/**
 * `window.recover` in the main process: when the window process dies or stops answering, a dialog of the system says
 * so and brings the window back. The connections and the work in progress live here and go on.
 */
import { dialog, type BrowserWindow, type RenderProcessGoneDetails } from 'electron';
import {
  timesInLastMinute,
  view,
  waitMs,
  timesWindowMs,
  type RecoverButton,
  type WindowTrouble,
} from '../features/window/recover';

/** What the recovery needs from the rest of the main process. */
export interface RecoverHost {
  readonly window: () => BrowserWindow | undefined;
  /** Whether the window is shown; a window hidden in the tray that is gone shows no dialog. */
  readonly isShown: () => boolean;
  /** Whether Datardo is quitting, when the window going away is expected. */
  readonly isQuitting: () => boolean;
  /** Writes a line in the Log, as `[window.recover] <text>`. */
  readonly log: (text: string) => void;
  /** Creates the window again, with the tabs or without them. */
  readonly reload: (withTabs: boolean) => void;
  /** Quits without asking: nothing can ask while the window is gone. */
  readonly quitAtOnce: () => void;
  /** The window is gone while hidden in the tray: it is created again when it is next shown. */
  readonly forget: () => void;
  readonly now: () => number;
}

/** Watches the window process of one window. */
export function watchTheWindowProcess(window: BrowserWindow, host: RecoverHost): void {
  const recovery = new Recovery(host);
  window.webContents.on('render-process-gone', (_event, details) => {
    recovery.gone(details);
  });
  window.on('unresponsive', () => {
    recovery.notAnswering();
  });
  window.on('responsive', () => {
    recovery.answering();
  });
}

/** The times the window process was gone, kept across the windows created again. */
const goneTimes: number[] = [];

class Recovery {
  private waiting: AbortController | undefined;
  private waitTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly host: RecoverHost) {}

  gone(details: RenderProcessGoneDetails): void {
    if (details.reason === 'clean-exit' || this.host.isQuitting()) {
      return;
    }
    const now = this.host.now();
    goneTimes.push(now);
    goneTimes.splice(0, goneTimes.length, ...goneTimes.filter((time) => now - time < timesWindowMs));
    const trouble: WindowTrouble = {
      kind: 'gone',
      reason: details.reason,
      timesInMinute: timesInLastMinute(goneTimes, now),
    };
    const shown = view(trouble);
    this.host.log(shown.logLine);
    if (!this.host.isShown()) {
      this.host.forget();
      return;
    }
    void this.ask(trouble);
  }

  notAnswering(): void {
    if (this.waiting !== undefined || this.waitTimer !== undefined) {
      return;
    }
    this.host.log(view({ kind: 'not-answering' }).logLine);
    void this.ask({ kind: 'not-answering' });
  }

  answering(): void {
    this.waiting?.abort();
    this.waiting = undefined;
    if (this.waitTimer !== undefined) {
      clearTimeout(this.waitTimer);
      this.waitTimer = undefined;
    }
  }

  private async ask(trouble: WindowTrouble): Promise<void> {
    const shown = view(trouble);
    const controller = new AbortController();
    this.waiting = trouble.kind === 'not-answering' ? controller : undefined;
    const window = this.host.window();
    const options = {
      type: 'warning' as const,
      title: 'Datardo',
      message: shown.message,
      ...(shown.detail === undefined ? {} : { detail: shown.detail }),
      buttons: shown.buttons.map((button) => button.title),
      defaultId: 0,
      cancelId: shown.buttons.length - 1,
      noLink: true,
      signal: controller.signal,
    };
    const answer =
      window === undefined || window.isDestroyed()
        ? await dialog.showMessageBox(options)
        : await dialog.showMessageBox(window, options);
    if (controller.signal.aborted) {
      return;
    }
    this.waiting = undefined;
    this.carryOut(shown.buttons[answer.response]);
  }

  private carryOut(button: RecoverButton | undefined): void {
    switch (button?.does) {
      case 'reload':
        this.host.reload(true);
        return;
      case 'reload-without-tabs':
        this.host.reload(false);
        return;
      case 'quit':
        this.host.quitAtOnce();
        return;
      case 'wait':
        this.waitTimer = setTimeout(() => {
          this.waitTimer = undefined;
          this.notAnswering();
        }, waitMs);
        return;
      case undefined:
        return;
    }
  }
}
