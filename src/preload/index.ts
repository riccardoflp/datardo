/**
 * The bridge: the one object the window process may use to reach the main process (D27, R14.6). It exposes typed
 * calls and nothing of Electron itself.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { bridgeChannel, isPingReply, type Bridge, type ExportResult, type IntentResult } from '../shared/bridge';
import type { AppEvent, AppState } from '../shared/state';

const bridge: Bridge = {
  ping: async () => {
    const reply: unknown = await ipcRenderer.invoke(bridgeChannel.ping);
    if (!isPingReply(reply)) {
      throw new Error('The main process sent a reply the bridge does not know.');
    }
    return reply;
  },
  state: async () => (await ipcRenderer.invoke(bridgeChannel.state)) as AppState,
  start: async (intent) => (await ipcRenderer.invoke(bridgeChannel.start, intent)) as IntentResult,
  answer: async (answer) => {
    await ipcRenderer.invoke(bridgeChannel.answer, answer);
  },
  cancel: async (work) => {
    await ipcRenderer.invoke(bridgeChannel.cancel, work);
  },
  dismiss: async (dismissal) => {
    await ipcRenderer.invoke(bridgeChannel.dismiss, dismissal);
  },
  clearLog: async () => {
    await ipcRenderer.invoke(bridgeChannel.clearLog);
  },
  exportLog: async (text) => (await ipcRenderer.invoke(bridgeChannel.exportLog, text)) as ExportResult,
  onEvent: (listener) => {
    const receive = (_event: IpcRendererEvent, event: AppEvent): void => {
      listener(event);
    };
    ipcRenderer.on(bridgeChannel.event, receive);
    return () => {
      ipcRenderer.removeListener(bridgeChannel.event, receive);
    };
  },
};

contextBridge.exposeInMainWorld('datardo', bridge);
