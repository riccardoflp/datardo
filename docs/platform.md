# Platform

What Datardo asks of Electron and of the three operating systems under it. Features never call the platform: they go
through the runner and the bridge, and the code that touches the system is in `src/main`, `src/storage` and
`src/engines/transport`.

## Minimum versions

| What | Version | Where it is said |
| --- | --- | --- |
| Windows | 10, 64-bit (x64 and ARM64) | `electron-builder.yml` |
| macOS | 12, Intel and Apple silicon | `electron-builder.yml` |
| Linux | a 64-bit desktop with glibc 2.31 or later; AppImage and `.deb` | `electron-builder.yml` |
| Electron | the current stable major when a milestone starts, raised at least once per release | `package.json` |
| Node.js, to build | 22 | `.nvmrc`, the CI |
| Python, for the catalog's check | 3.10 | [testing.md](testing.md#what-a-change-runs-before-it-is-committed) |
| MongoDB | 4.2 | [D11](decisions.md#d11--the-official-drivers-and-the-oldest-servers-they-serve) |
| Search indexes | Atlas, an Atlas local deployment, or MongoDB Community 8.3 with `mongot` | the `index.` cards |
| Redis | 6.2; `COMMAND DOCS` and functions need 7.0 | D11, the `console.` cards |

Windows comes first ([D25](decisions.md#d25--windows-first-then-macos-and-linux)); the CI builds and tests all three
from the first milestone.

## What the rest of the program sees

| Area | What the features and the window see | Behind it |
| --- | --- | --- |
| The window and its frame | the islands inside one window; `window.` cards | `src/main/window.ts` |
| The bridge | one typed object, `datardo`, with `send(intent)`, `answer(question, value)` and `subscribe(listener)` | `src/preload`, Electron's `contextBridge` and `ipcMain.handle` |
| Files | a step `write`, `delete`, `create folder`; a question that picks a file or a folder | Node's `fs` in the runner; Electron's `dialog` |
| The data folder | typed stores with versions | `src/storage`, Electron's `app.getPath('userData')` |
| Secrets | `get`, `set`, `delete` by name, in the main process only | `src/storage/secrets.ts`, Electron's `safeStorage` |
| Clipboard, opening a folder or a link | steps of what follows a plan | Electron's `clipboard` and `shell` |
| Notifications of the system, the tray | `runner.notify`, `window.tray` | Electron's `Notification` and `Tray` |
| One instance | `window.single-instance` | `app.requestSingleInstanceLock` |
| The theme of the system | `window.theme` | `nativeTheme` |
| Watching a queries folder | events of files added, changed, removed | Node's `fs.watch`, with a rescan on error |
| Time | `context.now` | the main process's clock, read by the runner only |

## Per system

| Need | Windows | macOS | Linux |
| --- | --- | --- | --- |
| The frame | `titleBarStyle: 'hidden'` with `titleBarOverlay`: the system's buttons over the top bar, colored from the theme's tokens; snap layouts work | `titleBarStyle: 'hiddenInset'`: the traffic lights inset in the top bar, which leaves them room | `frame: false`: Datardo draws minimize, maximize and close |
| Dragging | the top bar is a drag region; its controls are not | the same | the same; resizing by the window's edges |
| The menu bar | none | the system's menu, with the standard application, Edit and Window menus | none |
| The key of commands | `Ctrl` | `Cmd` | `Ctrl` |
| The key that encrypts secrets | DPAPI | Keychain | the secret service (GNOME Keyring, KWallet); none on some sessions, and then [D26](decisions.md#d26--secrets-are-encrypted-with-a-key-of-the-systems-keychain-or-not-kept) applies |
| The data folder | `%APPDATA%\Datardo` | `~/Library/Application Support/Datardo` | `~/.config/Datardo` |
| The tray | the notification area | the menu bar's status item | the status notifier, where the desktop has one |
| Installers | NSIS installer, per user | `.dmg`, universal | AppImage, `.deb` |
| Signing | none: SmartScreen warns ([D45](decisions.md#d45--the-installers-are-not-signed)) | ad-hoc only, not notarized: Gatekeeper warns (D45) | not needed |

`DATARDO_DATA` set to a folder makes Datardo use it as its data folder, which keeps a development instance and the
tests apart from an installed one.

On macOS and Linux the data folder, every folder Datardo makes in it (`state/`, `saved-queries/`, `undo/`, `tasks/`)
and every file it writes there are readable only by the user: folders with the mode `0700`, files with `0600`, set
when they are made and not left to the user's `umask`. At each start, before anything is read, the main process sets
these modes again on the data folder and on what it holds of Datardo's own, so that files and folders an older
version made with the `umask`'s modes (often `0644` and `0755`) are closed too; a mode that cannot be changed is said
once in the Log and stops nothing. `chromium/` is Electron's and is left as Electron makes it. On Windows the folder
is in the user's profile, whose permissions already keep the other users out, and nothing is changed. A folder
`DATARDO_DATA` names is treated the same way (M37; [security](security.md#what-can-go-wrong), T25).

## The packaged application

The installers carry Electron's binary with its fuses set by `electron-builder.yml` (`electronFuses`), so that the
installed Datardo cannot be started as something else ([security](security.md#what-can-go-wrong), T23). `npm run dev`
and the UI tests start the Electron of npm, whose fuses are not touched: Playwright passes it `--inspect`.

| Fuse | Set to | What it means |
| --- | --- | --- |
| `runAsNode` | off | `ELECTRON_RUN_AS_NODE` no longer turns the binary into a plain Node.js. The playground's process is a `utilityProcess` (`src/main/playground/launcher.ts`) and the worker threads are Node's `worker_threads` inside the main process: neither needs it |
| `enableNodeOptionsEnvironmentVariable` | off | `NODE_OPTIONS` (`--require`, `--import` of a file) is ignored |
| `enableNodeCliInspectArguments` | off | `--inspect`, `--inspect-brk` and `SIGUSR1` open no debugger |
| `onlyLoadAppFromAsar` | on | the code is loaded only from `app.asar`, never from an `app` folder put beside it; the files of `asarUnpack` are still read from `app.asar.unpacked` |
| `enableCookieEncryption` | on | what Chromium keeps in its cookie store is encrypted with the keychain's key; Datardo keeps nothing there, but nothing is left in clear text if something does |
| `enableEmbeddedAsarIntegrityValidation` | left off | validating `app.asar` is worth something only once the application is signed: unsigned, whoever can change `app.asar` can change the fuses too ([D45](decisions.md#d45--the-installers-are-not-signed)) |
| `grantFileProtocolExtraPrivileges` | left on, Electron's default | the window is loaded from `file://` (`window.loadFile`), as R14.6 allows |

Before a release, on each system, the packaged application is started with these fuses and runs a playground and a
comparison (its worker thread); `npx @electron/fuses read --app <the packaged binary>` lists the fuses as above
(M37).

## Networking

- **MongoDB**: the `mongodb` driver, with its TLS; the CA, the client certificate and its key come from the
  connection's TLS options.
- **Redis**: the `redis` client, RESP3 when the server speaks it, `rediss://` or the TLS options for TLS. Pub/Sub and
  the console each open a connection of their own to the server.
- **SSH tunnels**: `ssh2`, a local port forwarded to the connection's host, the server's key checked against the known
  hosts. The same code serves both engines.
- **The MCP server**: Node's `http` on `127.0.0.1`, port 37018 unless the setting says otherwise.
- **The check for a newer version**: one `GET` to `api.github.com` at start and once a day, from the main process,
  unless `datardo.window.checkForUpdates` is off (`window.check-update`,
  [D44](decisions.md#d44--datardo-says-when-a-newer-version-exists-and-installs-nothing-by-itself)).
- **Nothing else.** Datardo calls no service of its own, sends no usage data, and downloads nothing.

## Text

Everything is UTF-8. Key names and values of Redis are bytes and are never assumed to be text. Sorting names shown to
the user (connections, databases, collections) uses the system's locale; sorting that a stored file or a test depends
on uses code points.
