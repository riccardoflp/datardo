/**
 * Answers the bridge: what the window process asks of the main process (architecture, "The bridge"). It also gives
 * the runner's ports to what starts features by itself (the check for a newer version), once they are ready.
 */
import { app, dialog, ipcMain, Notification } from 'electron';
import {
  bridgeChannel,
  type DialogAnswer,
  type Dismissal,
  type ExportResult,
  type Intent,
  type PingReply,
} from '../shared/bridge';
import type { WorkId } from '../shared/ids';
import { notifiesTheSystem } from '../features/runner/notify';
import { setting } from '../features/settings/read';
import { cancel } from '../runner/cancel';
import type { RunnerPorts } from '../runner/ports';
import { writeAtomically } from '../storage/store';
import type { AppStateHolder } from './app-state';
import type { WindowDialogs } from './dialogs';
import { startWithConsoles } from './console-commands';
import { consolesReady } from './consoles';
import { keepTabQuery } from './query';
import { withTestFeatures } from './test-features';

let readyPorts: (ports: RunnerPorts) => void = () => undefined;
const ready = new Promise<RunnerPorts>((resolve) => {
  readyPorts = resolve;
});

/** The runner's ports, once the bridge answers: what starts a feature without the window uses them. */
export function whenRunnerReady(): Promise<RunnerPorts> {
  return ready;
}

/** Answers every channel of the bridge. */
export function answerTheBridge(given: RunnerPorts, state: AppStateHolder, dialogs: WindowDialogs): void {
  const ports = process.env['DATARDO_TEST'] === '1' ? withTestFeatures(given) : given;
  readyPorts(ports);
  consolesReady(ports);
  ipcMain.handle(bridgeChannel.ping, (): PingReply => ({ name: 'Datardo', version: app.getVersion() }));
  ipcMain.handle(bridgeChannel.state, () => state.get());
  ipcMain.handle(bridgeChannel.start, async (_event, intent: Intent) => {
    const started = Date.now();
    const result = await startWithConsoles(ports, intent);
    keepTabQuery(state, intent, result);
    tellTheSystem(state, Date.now() - started, result.kind === 'failed' ? result.message : undefined);
    return result;
  });
  ipcMain.handle(bridgeChannel.answer, (_event, answer: DialogAnswer) => {
    dialogs.answer(answer);
  });
  ipcMain.handle(bridgeChannel.cancel, (_event, work: WorkId) => {
    cancel(ports, work);
  });
  ipcMain.handle(bridgeChannel.dismiss, (_event, dismissal: Dismissal) => {
    if (dismissal.kind === 'notification') {
      state.dispatch({ slice: 'runner', type: 'notification-closed', id: dismissal.id });
    } else {
      state.dispatch({ slice: 'runner', type: 'work-ended', id: dismissal.id as WorkId });
    }
  });
  ipcMain.handle(bridgeChannel.clearLog, () => {
    state.dispatch({ slice: 'runner', type: 'log-cleared' });
  });
  ipcMain.handle(bridgeChannel.exportLog, (_event, text: string) => exportLog(text));
}

/** **Export…** of the Log: the file the user chooses, written with the lines shown. */
async function exportLog(text: string): Promise<ExportResult> {
  const chosen = await dialog.showSaveDialog({
    title: 'Export the Log',
    defaultPath: 'datardo-log.txt',
    filters: [{ name: 'Text', extensions: ['txt', 'log'] }],
  });
  if (chosen.canceled || chosen.filePath === '') {
    return { kind: 'cancelled' };
  }
  await writeAtomically(chosen.filePath, `${text}\n`);
  return { kind: 'written', path: chosen.filePath };
}

/** Work that ran longer than 30 seconds and ended while the window was not in front notifies the system too. */
function tellTheSystem(state: AppStateHolder, durationMs: number, error: string | undefined): void {
  const now = state.get();
  const windowInFront = now.window.focused;
  const on = setting(now.settings, 'datardo.runner.systemNotifications');
  if (!notifiesTheSystem({ durationMs, windowInFront, setting: on }) || !Notification.isSupported()) {
    return;
  }
  new Notification({ title: 'Datardo', body: error ?? 'The work you started has ended.' }).show();
}
