/**
 * The main process: starts Datardo as one instance on its data folder (`window.single-instance`), opens its one window
 * and answers the bridge. It wires the other modules together and holds no feature's logic (architecture).
 */
import { app } from 'electron';
import { join } from 'node:path';
import { arch, release } from 'node:os';
import type { Intent } from '../shared/bridge';
import type { Platform } from '../shared/feature';
import { featureId } from '../shared/ids';
import { appTarget } from '../shared/target';
import { runnableFeatures } from '../features/registry';
import { fedSummary } from '../features/transfer/ends/summary';
import type { RunnerPorts } from '../runner/ports';
import { writeLog } from '../runner/log';
import { start } from '../runner/start';
import { appActions } from './actions';
import { answerTheBridge } from './bridge';
import { AppStateHolder } from './app-state';
import { setTheMenuBar } from './app-menu';
import { startAreas } from './areas';
import { islandFields, islandsOf } from './nav';
import { connectionEngines, connectionName, isConnected, isReadOnly } from './connections';
import { withConsoles } from './console-commands';
import { withPubSub } from './pubsub-commands';
import { WindowDialogs } from './dialogs';
import { fileWriter } from './files';
import { oplogClients } from './oplog';
import { transferFeeds } from './transfer-feeds';
import { endsWithOwnMessage } from './transfer-steps';
import type { MainServices } from './services';
import { guardTheSession } from './window-guard';
import { windowHost } from './window-host';
import { followTheLook } from './window-look';
import { WindowPlace } from './window-place';

/**
 * A closed standard output (the terminal or the test runner that started Datardo is gone) is no error of Datardo's: a
 * write to it is dropped, instead of Electron's dialog of an error in the main process. Any other error still is one.
 */
function ignoreAClosedPipe(stream: NodeJS.WriteStream): void {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EPIPE') {
      throw error;
    }
  });
}
ignoreAClosedPipe(process.stdout);
ignoreAClosedPipe(process.stderr);

const dataFolder = process.env['DATARDO_DATA'];
if (dataFolder !== undefined && dataFolder !== '') {
  app.setPath('userData', dataFolder);
}
// What Chromium keeps for itself goes to a folder of its own in the data folder (data.md).
app.setPath('sessionData', join(app.getPath('userData'), 'chromium'));

const platform: Platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
const state = new AppStateHolder();
const dialogs = new WindowDialogs(state);
const flushes: (() => Promise<void>)[] = [];
/** How long the stores are given to write at quit. */
const flushWaitMs = 5000;

const services: MainServices = {
  state,
  dataFolder: app.getPath('userData'),
  window: () => windowHost.current(),
  onQuit: (flush) => flushes.push(flush),
  dialogs,
  platform,
  start: (asked) => start(sharedPorts(), asked),
};

function runnerPorts(): RunnerPorts {
  return {
    features: runnableFeatures(),
    engines: withPubSub(withConsoles(connectionEngines())),
    appActions: appActions(services),
    files: fileWriter,
    dialogs,
    state,
    platform,
    isReadOnly,
    isConnected,
    connectionName,
    now: () => Date.now(),
    oplog: oplogClients,
    feeds: transferFeeds(connectionEngines),
    fedSummary,
    endsWithOwnMessage,
  };
}

let ports: RunnerPorts | undefined;

/** The one set of ports every start goes through, made when first needed. */
function sharedPorts(): RunnerPorts {
  ports ??= runnerPorts();
  return ports;
}

/** The system and its architecture as About shows them: `Windows 11 x64`, `macOS 15.1 arm64`, `Linux 6.8 x64`. */
function systemName(): string {
  switch (platform) {
    case 'windows': {
      const build = Number(release().split('.')[2] ?? '0');
      return `Windows ${build >= 22000 ? '11' : '10'} ${arch()}`;
    }
    case 'macos':
      return `macOS ${process.getSystemVersion()} ${arch()}`;
    case 'linux':
      return `Linux ${release().split('.').slice(0, 2).join('.')} ${arch()}`;
  }
}

/** Datardo's page, from the development server or from the build. */
async function loadThePage(window: Electron.BrowserWindow): Promise<void> {
  const devServer = process.env['ELECTRON_RENDERER_URL'];
  if (devServer !== undefined && !app.isPackaged) {
    await window.loadURL(devServer);
  } else {
    await window.loadFile(join(import.meta.dirname, '../ui/index.html'));
  }
}

function intent(feature: string): Intent {
  return { feature: featureId(feature), target: appTarget };
}

async function startDatardo(): Promise<void> {
  state.dispatch({
    slice: 'app',
    type: 'started',
    info: {
      version: app.getVersion(),
      platform,
      system: systemName(),
      runtime: { electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node },
      dataFolder: services.dataFolder,
    },
  });
  await startAreas(services);
  const startFeature = (asked: Intent): ReturnType<typeof start> => start(sharedPorts(), asked);
  const log = (feature: string, text: string): void => {
    writeLog(sharedPorts(), [{ feature, kind: 'info', text }]);
  };
  const place = new WindowPlace(services.dataFolder, (text) => {
    log('window.remember', text);
  });
  await place.load();
  services.onQuit(() => place.flush());
  // The islands' widths and whether they are hidden are kept in window.json (nav.layout, nav.resize).
  state.dispatch({ slice: 'nav', type: 'changed', nav: islandsOf(place.others(), state.get().nav) });
  state.listen((event, now) => {
    if (event.slice === 'nav') {
      place.keepOthers(islandFields(now.nav));
    }
  });
  windowHost.configure({
    platform,
    holder: state,
    place,
    preload: join(import.meta.dirname, '../preload/index.cjs'),
    load: loadThePage,
    start: startFeature,
    log,
    onClosed: () => {
      dialogs.cancelAll();
    },
  });
  answerTheBridge(sharedPorts(), state, dialogs);
  guardTheSession();
  setTheMenuBar(platform, state, (asked) => void startFeature(asked));
  followTheLook(state, () => windowHost.current(), platform);
  await windowHost.open();
}

if (!app.requestSingleInstanceLock()) {
  // Another Datardo runs on this data folder: it shows its window, and this one quits without one.
  app.quit();
} else {
  app.on('second-instance', () => {
    void windowHost.need().start(intent('window.single-instance'));
  });

  app.on('activate', () => {
    // A click on Datardo's icon in the Dock shows the window hidden in the tray.
    if (!windowHost.isShown()) {
      void windowHost.need().start(intent('window.single-instance'));
    }
  });

  app.on('window-all-closed', () => {
    // The window closes when Datardo quits; a window gone while hidden in the tray keeps Datardo running.
    if (windowHost.isQuitting()) {
      app.quit();
    }
  });

  app.on('before-quit', (event) => {
    if (!windowHost.isQuitting()) {
      event.preventDefault();
      windowHost.askToQuit();
    }
  });

  app.on('will-quit', (event) => {
    // The window is closed: the stores write what waits, then Datardo ends. `app.quit()` does nothing once `will-quit`
    // was held, so the end is `app.exit()`; a write that never ends does not keep Datardo running.
    event.preventDefault();
    const waiting = flushes.splice(0);
    const written = Promise.allSettled(waiting.map((flush) => flush()));
    const late = new Promise((resolve) => setTimeout(resolve, flushWaitMs));
    void Promise.race([written, late]).then(() => {
      app.exit(0);
    });
  });

  void app.whenReady().then(startDatardo);
}
