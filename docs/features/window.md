# The window

The window itself, for every engine: its frame without a title bar of the operating system, the top bar and the
window's buttons on each platform, the size and place it remembers, the theme, zoom, full screen, the one instance,
the tray icon, quitting, About, the data folder, the system's menu bar on macOS, and what happens when the window
process crashes or stops answering. What the window holds (the rail, the islands, the status line, the dialogs) is
in [nav.md](nav.md); the tab strip in [tab.md](tab.md); Go to in [palette.md](palette.md).

Datardo has one window. It is an Electron window: the main process creates it, and the window process draws it.

## The frame

### `window.frame` — The frame on each platform

Datardo draws its whole window, so the frame the system gives is reduced to what each platform needs: its own
buttons where the system can draw them over the top bar, and nothing where it cannot.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/window/frame.ts › frame(platform, theme)`
- **Inputs**: the platform (Windows, macOS, Linux) and the theme in use (dark or light, after `window.theme`).
- **Output**: the options the main process creates the window with: how the frame is drawn, where the system's
  buttons are, the room the top bar leaves for them, the minimum size, the background color.
- **Rules**:
  - Every platform: no title bar of the operating system. The top bar (`window.top-bar`) is 40 px high *(Datardo's
    choice)* and takes its place. The minimum size is 640 × 400 px. The window is resized from its edges and
    corners. It is created hidden and shown when its first frame is drawn, with the background color of the theme,
    so that no white rectangle is ever seen.
  - Windows: the system's own **Minimize**, **Maximize** and **Close** buttons are drawn by the system over the right
    end of the top bar (Electron's hidden title bar with the title bar overlay), 40 px high, in the theme's colors.
    The top bar leaves them the room the system reports, 138 px at 100% scaling. Snap layouts open from the
    system's **Maximize** button. There is no menu bar.
  - macOS: the system's three buttons (close, minimize, full screen) are inset at the left of the top bar (Electron's
    hidden inset title bar), centered on its height. The top bar leaves 78 px *(Datardo's choice)* free at its left.
    The system's menu bar is kept (`window.app-menu`).
  - Linux: no frame at all. Datardo draws three buttons at the right end of the top bar, in this order: **Minimize**,
    **Maximize** (which reads **Restore** while the window is maximized), **Close**; each is 46 × 40 px *(Datardo's
    choice)*. There is no menu bar.
- **Invariants**: the result depends on nothing but its two inputs; the top bar is never under a button of the
  system; the minimum size is the same on every platform.
- **Worked examples**:
  - Windows, dark → hidden title bar with the overlay 40 px high in the dark theme's colors; 138 px left free at the
    right of the top bar; no menu bar; minimum 640 × 400.
  - macOS, light → hidden inset title bar; 78 px left free at the left of the top bar; the system's menu bar;
    minimum 640 × 400.
  - Linux, dark → no frame; Datardo's **Minimize**, **Maximize** and **Close** at the right of the top bar, 138 px
    in all; no menu bar; minimum 640 × 400.
- **Uses**: `window.top-bar`, `window.theme`, `window.size`, `window.close`.
- **Ported from**: *New in Datardo*. For reference, Mongoster's desktop app keeps the system's frame and a menu bar:
  `src/standalone/main.ts` (`createWindow`, where the minimum size 640 × 400 comes from).

Acceptance:

- [ ] On Windows 11, hovering the system's **Maximize** button of Datardo's window shows the snap layouts.
- [ ] On Windows, the buttons at the right of the top bar are the system's: with the dark theme their background is
  the top bar's and their symbols are light; changing to the light theme changes them at once, without a restart.
- [ ] On macOS the three buttons of the system are at the left of the top bar, and the app's name starts 78 px from
  the window's left edge.
- [ ] On Linux the top bar ends with **Minimize**, **Maximize** and **Close**, each with a name a screen reader says;
  while the window is maximized the middle one reads **Restore**.
- [ ] On no platform does the window show a title bar of the system or, on Windows and Linux, a menu bar; pressing
  `Alt` alone shows no menu.
- [ ] The window cannot be made smaller than 640 × 400 px by dragging its edges.
- [ ] Starting Datardo with the dark theme never shows a white window: the first thing seen is the dark background.

### `window.title` — The name of the window for the system

The window has no title bar, but the taskbar, the Dock and the system's window switcher still name it.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/window/title.ts › windowTitle(activeTab)`
- **Inputs**: the active tab: its title (`tab.title`) and the name of its connection, or none for a tab of the app.
- **Output**: one line of text.
- **Rules**: `<title of the tab> — <name of the connection> — Datardo` for a tab of a connection; `<title of the
  tab> — Datardo` for a tab of the app; `Datardo` when no tab is active. Nothing else is ever in it: no address, no
  query text, no value.
- **Worked examples**:
  - the collection tab of `orders` on the connection Local → `orders — Local — Datardo`
  - the Home tab → `Home — Datardo`
  - the key tab of `session:9f2c` on Cache local → `session:9f2c — Cache local — Datardo`
- **Uses**: `tab.title`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] With the collection tab of `orders` on Local active, the Windows taskbar names the window `orders — Local —
  Datardo`.
- [ ] Making the Home tab active changes the name to `Home — Datardo` at once.
- [ ] The name never holds a host, a user, a password or the text of a query.

### `window.top-bar` — The top bar

The strip at the top of the window: the app's name, the **Go to** field, the state of the MCP server and the
window's buttons. Its empty part moves the window.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/window/top-bar.ts › view(state)`
- **Entry points**: always shown, at the top of the window, 40 px high.
- **Shows**, from left to right:
  1. on macOS, the room for the system's buttons (`window.frame`);
  2. Datardo's icon and the name **Datardo**;
  3. the **Go to** field, centered in the window: the text *Go to a collection, a key, a page or a command* and, at
     its right end, `Ctrl+K`. It is 480 px wide *(Datardo's choice)* and narrows with the window down to 200 px
     *(Datardo's choice)*; below that only a button with a magnifying glass, named **Go to**, is left;
  4. the state of the MCP server: the text **MCP** and a dot. What the dot says and what a click on it does are on
     the card of `mcp.server`;
  5. the window's buttons: the system's on Windows, Datardo's on Linux (`window.frame`), none here on macOS.
- **States**:
  - Dragging: the part of the top bar that holds no control drags the window. The **Go to** field, the MCP state and
    the buttons do not.
  - A double click on the empty part maximizes the window, or restores it when it is maximized (`window.size`). On
    macOS it does what the system's own setting for a double click on a title bar says.
  - A right click on the empty part opens the system's window menu on Windows; it does nothing on macOS and Linux.
  - Full screen (`window.full-screen`): the top bar stays; on Windows and macOS the system hides its buttons, on
    Linux Datardo's three buttons are replaced by one, **Exit full screen**.
  - A dialog is open (`nav.dialog`): the empty part still drags the window; the **Go to** field and the MCP state
    do not answer.
- **Uses**: `palette.open` (a click on the field), `mcp.server`, `window.size`, `window.close`, `window.full-screen`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] Pressing the mouse on the empty part of the top bar and moving it moves the window; pressing it on the **Go
  to** field does not.
- [ ] On Windows and Linux a double click on the empty part maximizes the window, and a second one restores the size
  it had.
- [ ] A click on the **Go to** field opens Go to with the text field focused, exactly as `Ctrl+K` does.
- [ ] In a window 700 px wide the field is replaced by the button **Go to**, which opens the same list.
- [ ] On Linux, in full screen, the top bar ends with the single button **Exit full screen**.
- [ ] Every control of the top bar has a name a screen reader says: **Go to**, **MCP server**, **Minimize**,
  **Maximize** or **Restore**, **Close**.

### `window.size` — Minimize, maximize and restore the window

The three changes of size every window has, for whoever uses the keyboard or Datardo's own buttons on Linux.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/window/size.ts › plan(context, answers)`
- **Entry points**: on Linux, the buttons **Minimize** and **Maximize** or **Restore** of the top bar (`@top-bar`);
  a double click on the empty part of the top bar (`@top-bar`); on macOS the **Window** menu (`@app-menu`); Go to
  (**Minimize window**, **Maximize window**, **Restore window**). On Windows and macOS the system's own buttons and
  keys do the same without passing through Datardo.
- **Offered when**: **Maximize window** while the window is neither maximized nor in full screen; **Restore window**
  while it is maximized; **Minimize window** always.
- **Plan**: one app step: `minimize the window`, `maximize the window` or `restore the window`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. **Restore window** puts
  the size back.
- **After**: `window.remember` saves the new state.
- **Commands**: `window.size:minimize`, `window.size:maximize`, `window.size:restore`.
- **Uses**: `window.remember`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] On Linux, **Maximize** fills the work area of the display the window is on, and the button then reads
  **Restore**; **Restore** gives back the exact size and place the window had.
- [ ] **Minimize window**, run from Go to, minimizes the window; work in progress goes on while it is minimized.
- [ ] While the window is maximized, Go to lists **Restore window** and not **Maximize window**.
- [ ] Maximizing on Windows with the system's keys (`Win+Up`) has the same effect, and Go to then lists **Restore
  window**.

## Size and place

### `window.remember` — Remember the size, the place and the maximized state

Datardo opens where it was closed, as large as it was, maximized if it was.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/window/remember.ts › plan(context, answers)`
- **Entry points**: none. It runs by itself 500 ms *(Datardo's choice)* after the window was last moved or resized,
  when the window is maximized or restored, and when the window closes.
- **Plan**: one app step, `save the size and place of the window`: the left and top of the window, its width and
  height as they are when it is not maximized, and whether it is maximized, in a file of the data folder.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded.
- **After**: nothing is shown. A file that cannot be written is not an error for the user: the next start uses what
  was saved before, or the default (`window.placement`).
- **Uses**: `window.placement`, which reads what this saves.
- **Ported from**: *New in Datardo*. For reference, Mongoster's desktop app saves the same five values when the window
  closes: `src/standalone/main.ts` (`saveWindowState`).

Acceptance:

- [ ] Resizing the window to 1,000 × 700 px at 200, 100, quitting and starting again opens it 1,000 × 700 px at 200,
  100.
- [ ] Maximizing, quitting and starting again opens the window maximized; restoring it then gives the size and place
  it had before it was maximized, not the size of the display.
- [ ] Full screen is not remembered: a Datardo quit in full screen starts as it was before entering it.
- [ ] Killing Datardo's processes one second after moving the window does not lose the new place.
- [ ] With the data folder read-only, moving the window shows no error and no notification.

### `window.placement` — Where the window opens

Decides the size and place of the window at start, also when the display it was on is gone.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/window/placement.ts › placement(saved, displays)`
- **Inputs**: what `window.remember` saved (left, top, width, height, maximized), or nothing; the work area of each
  display now connected (its left, top, width, height, without the system's taskbar or Dock), the primary one first.
- **Output**: left, top, width, height and whether to maximize.
- **Rules**, in order:
  1. Nothing saved, a file that cannot be read, a saved width under 400 px or a saved height under 300 px: the
     default, 1,280 × 800 px, not maximized.
  2. The size is the saved one (or the default), made no smaller than the minimum 640 × 400 px and no larger than
     the work area of the display chosen in rule 3 or 4.
  3. The window is *on screen* when, on one display, at least 100 px *(Datardo's choice)* of its width and the whole
     height of its top bar (its first 40 px) lie inside that display's work area. Then it keeps its saved left and
     top, on that display. With several such displays, the one that holds most of the window.
  4. Otherwise (the display is gone, the layout of the displays changed, nothing was saved) it is centered in the
     work area of the primary display: left = display left + (display width − width) / 2, top = display top +
     (display height − height) / 2, rounded down.
  5. Maximized as saved, on the display chosen.
- **Invariants**: the top bar is always reachable with the mouse; the result never lies outside every display; the
  same inputs give the same result.
- **Worked examples** (left, top, width × height):
  - nothing saved; one display 0, 0, 1,920 × 1,040 → 320, 120, 1,280 × 800, not maximized
  - nothing saved; one display 0, 0, 1,366 × 728 → 43, 0, 1,280 × 728, not maximized
  - saved 100, 80, 1,280 × 800; one display 0, 0, 1,920 × 1,040 → 100, 80, 1,280 × 800
  - saved 2,100, 120, 1,400 × 900 on a second display that is now gone; one display 0, 0, 1,920 × 1,040 → 260, 70,
    1,400 × 900
  - saved −1,200, 50, 1,280 × 800 (80 px left on screen); one display 0, 0, 1,920 × 1,040 → 320, 120, 1,280 × 800
  - saved 2,100, 120, 2,400 × 1,300, maximized, display gone; one display 0, 0, 1,920 × 1,040 → 0, 0, 1,920 × 1,040,
    maximized
  - saved 50, 50, 300 × 200; one display 0, 0, 1,920 × 1,040 → 320, 120, 1,280 × 800
- **Ported from**: *New in Datardo*. For reference, Mongoster's desktop app has the default 1,280 × 800 and the
  400 × 300 check, and does not bring a window back on screen: `src/standalone/main.ts` (`readWindowState`).

Acceptance:

- [ ] The first start on a display of 1,920 × 1,040 px of work area opens the window 1,280 × 800 px at 320, 120.
- [ ] A window closed on a second display opens centered on the primary display, with the size it had, when Datardo
  starts with that display unplugged.
- [ ] A window saved with only 80 px of its width on screen opens centered; one saved with 100 px on screen opens
  where it was.
- [ ] A saved size larger than the display opens as large as the display's work area, never larger.
- [ ] A file of the saved state that holds text that is not JSON gives the default size and place, with no error
  shown.

## How it looks

### `window.theme` — Choose the theme

The colors of the window: dark, light, or as the system.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/window/theme.ts › plan(context, answers)`
- **Entry points**: the setting in the Settings page (`settings.page`); on macOS **View › Theme** (`@app-menu`), three
  entries of which one is marked: **Follow the system**, **Dark**, **Light**; Go to (**Theme: follow the system**,
  **Theme: dark**, **Theme: light**).
- **Offered when**: always. The entry of the theme in use is marked, and Go to still lists it.
- **Reads**: whether the system uses dark colors, when the setting is `system`.
- **Plan**: one app step: `set the theme to Follow the system`, `set the theme to Dark` or `set the theme to Light`,
  which writes the setting.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. Choosing the other theme
  puts it back.
- **After**: the whole window takes the new colors at once, without a restart: the islands, the editors and their
  syntax colors, the dialogs and notifications that are open, the system's buttons on Windows (`window.frame`), and
  the dialogs of the system (the file dialogs, the menus). The six colors of connections keep their meaning in both
  themes.
- **Commands**: `window.theme:system`, `window.theme:dark`, `window.theme:light`.
- **Settings**: `datardo.window.theme`: `system` (the default), `dark` or `light`.
- **Uses**: `settings.read`, `settings.page`.
- **Ported from**: *New in Datardo*. For reference, Mongoster's desktop app has the same three choices and their
  names: `src/standalone/vscode/appearance.ts`, `src/standalone/main.ts` (`buildMenu`).

Acceptance:

- [ ] With no setting, Datardo starts dark on a system set to dark and light on a system set to light.
- [ ] **Theme: light** turns every island, the open editors and an open dialog light at once, and writes
  `datardo.window.theme` as `light`.
- [ ] With `system`, switching the system from light to dark while Datardo is open turns the window dark within one
  second, without a restart.
- [ ] With `dark`, switching the system to light changes nothing in the window.
- [ ] A value in the settings file that is none of the three (`blue`) is read as `system`.
- [ ] The theme is applied before the window is first shown: starting with `light` on a dark system never shows a
  dark frame.
- [ ] A system file dialog opened from Datardo with `dark` chosen is dark on a light system.

### `window.zoom` — Zoom in, zoom out, reset the zoom

Makes everything in the window larger or smaller.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/window/zoom.ts › plan(context, answers)`
- **Entry points**: `Ctrl+=` or `Ctrl++` (**Zoom in**), `Ctrl+-` (**Zoom out**), `Ctrl+0` (**Reset zoom**);
  `Ctrl` with the mouse wheel over the window; on macOS the **View** menu (`@app-menu`); the percentage on the
  status line, which resets it (`@status-line`); Go to with the same three titles; the setting in the Settings page.
- **Offered when**: **Zoom in** under 200%, **Zoom out** over 50%, **Reset zoom** at any value but 100%. At a limit
  the key does nothing.
- **Plan**: one app step, `set the zoom to 125%`, which writes the setting.
- **Rules**: the steps are 50, 67, 75, 80, 90, 100, 110, 125, 150, 175 and 200% *(Datardo's choice: Chromium's own
  steps)*. **Zoom in** goes to the first step above the present value, **Zoom out** to the first below it, **Reset
  zoom** to 100%. The zoom applies to the whole window, the top bar and the dialogs included; the system's buttons
  on Windows and macOS keep the system's size, and the top bar keeps the room they need.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. **Reset zoom** puts it
  back.
- **After**: the window is drawn at the new size at once; the islands keep their widths in pixels of the screen as
  far as `nav.layout` allows; the status line shows the percentage while it is not 100% (`nav.status-line`).
- **Commands**: `window.zoom:in`, `window.zoom:out`, `window.zoom:reset`.
- **Settings**: `datardo.window.zoom`: a number from 50 to 200, 100 by default. A value outside is brought to the
  nearest limit.
- **Uses**: `settings.read`, `nav.status-line`, `nav.layout`.
- **Ported from**: *New in Datardo*. For reference, Mongoster's desktop app has the three entries in its **View** menu:
  `src/standalone/main.ts` (`buildMenu`).

Acceptance:

- [ ] From 100%, `Ctrl+=` gives 110%, again 125%, again 150%; `Ctrl+0` gives 100%.
- [ ] From 100%, `Ctrl+-` gives 90%, then 80%, 75%, 67%, 50%; a sixth press changes nothing.
- [ ] With `datardo.window.zoom` set to 120 in the settings file, **Zoom in** gives 125% and **Zoom out** gives 110%.
- [ ] At 200%, Go to does not list **Zoom in**.
- [ ] The zoom is the same after quitting and starting again.
- [ ] At 150% on Windows the system's three buttons are the size they were, and the MCP state is not under them.
- [ ] At 125% the status line shows `125%`; a click on it gives 100% and the percentage goes away.

### `window.full-screen` — Full screen

Gives the window the whole display, without the taskbar or the Dock.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/window/full-screen.ts › plan(context, answers)`
- **Entry points**: `F11` (on macOS `Ctrl+Cmd+F` and the system's green button); on macOS **View › Enter full
  screen** (`@app-menu`); on Linux, in full screen, the button **Exit full screen** of the top bar (`@top-bar`); Go
  to (**Enter full screen**, or **Exit full screen** while in it).
- **Plan**: one app step: `enter full screen` or `exit full screen`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. The same key leaves it.
- **After**: the top bar stays (`window.top-bar`). Leaving full screen gives back the size, the place and the
  maximized state the window had. `Esc` does not leave full screen: it belongs to dialogs and to Go to.
- **Commands**: `window.full-screen`.
- **Uses**: `window.top-bar`, `window.remember`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] `F11` fills the display and hides the taskbar; `F11` again gives back a maximized window if it was maximized,
  or its size and place if it was not.
- [ ] In full screen the **Go to** field is still in the top bar and `Ctrl+K` opens it.
- [ ] `Esc` in full screen, with no dialog open, changes nothing.
- [ ] Quitting in full screen and starting again opens a window that is not in full screen (`window.remember`).

## One Datardo

### `window.single-instance` — One instance, one window

Starting Datardo while it is already running brings its window to the front instead of opening a second Datardo.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/window/single-instance.ts › plan(context, answers)`
- **Entry points**: starting Datardo again: its icon, the Start menu, the Dock, a command line.
- **Plan**: in the instance already running, the app steps `show the window`, then `bring the window to the front`.
  The instance just started quits without creating a window and without touching the data folder.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded.
- **After**: a window that was minimized is restored; a window hidden while Datardo was in the tray is shown and the
  tray icon goes (`window.tray`); the window takes the focus. What the window was showing does not change: the same
  tab is active, an open dialog stays open.
- **Rules**: an instance is one Datardo on one data folder. A Datardo started with another data folder (the
  environment variable `DATARDO_DATA` names it) is another instance, with its own window, connections and
  scheduled tasks. The arguments of the second start are not used in the first release.
- **Uses**: `window.tray`.
- **Ported from**: *New in Datardo*. For reference, Mongoster's desktop app does the same:
  `src/standalone/main.ts` (`requestSingleInstanceLock`, `showWindow`).

Acceptance:

- [ ] Starting Datardo while its window is minimized restores that window and gives it the focus; the list of
  processes shows no second Datardo two seconds later.
- [ ] Starting Datardo while it runs in the tray shows the window with the tabs it had, and the tray icon is gone.
- [ ] Starting Datardo while a confirmation is open in its window brings the window to the front with the
  confirmation still open and nothing confirmed.
- [ ] A scheduled task due at that moment runs once, not twice.
- [ ] Datardo started with `DATARDO_DATA` set to another folder opens its own window beside the first.

### `window.close` — Close the window

Closing the window quits Datardo, unless scheduled tasks keep it running in the tray.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/window/close.ts › plan(context, answers)`
- **Entry points**: the system's **Close** button on Windows and macOS; Datardo's **Close** button on Linux
  (`@top-bar`); `Alt+F4` on Windows and Linux; the system's window menu; Go to (**Close window**).
- **Reads**: whether closing keeps Datardo in the tray, which `task.tray` decides.
- **Plan**: when `task.tray` says Datardo stays: the app steps `hide the window` and `show the tray icon`. Otherwise
  the plan of `window.quit`, with its questions.
- **Danger**: None when the window goes to the tray; otherwise that of `window.quit`.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. **Open Datardo** in the
  tray shows the window again.
- **After**: in the tray, everything goes on as it was: the connections stay connected, the tabs keep what they
  show, work in progress and scheduled tasks run, the MCP server answers. `window.remember` has saved the size and
  place.
- **Rules**: closing the window quits on macOS too: Datardo has one window and its tabs live in it. `Ctrl+W` closes
  a tab, never the window (`tab.close`).
- **Commands**: `window.close`.
- **Uses**: `task.tray`, `window.tray`, `window.quit`, `window.remember`.
- **Ported from**: *New in Datardo*. For reference, Mongoster's desktop app: `src/standalone/main.ts` (the `close`
  handler of `createWindow`, `keepInTray`, `hideToTray`).

Acceptance:

- [ ] With `task.tray` keeping Datardo running, closing the window hides it, shows the tray icon and asks nothing,
  even with unsaved changes in a tab: nothing is lost, since nothing closed.
- [ ] Without it, closing the window does exactly what **Quit Datardo** does, with the same questions.
- [ ] On macOS, closing the window with no scheduled task enabled quits Datardo: no icon is left in the Dock as a
  running app.
- [ ] An export running when the window goes to the tray finishes, and its file is complete.
- [ ] `Ctrl+W` with one tab open closes or keeps that tab as `tab.close` says, and the window stays.

### `window.tray` — The tray icon and its menu

While Datardo runs without its window, an icon in the system's tray says so and brings the window back.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/window/tray.ts › view(state)`
- **Entry points**: the tray of the system (the notification area on Windows, the right of the menu bar on macOS,
  the tray of the desktop on Linux).
- **Offered when**: only while the window is hidden because closing it kept Datardo running (`window.close`,
  `task.tray`). While the window is shown there is no tray icon.
- **Shows**: Datardo's icon, 16 px, with the text **Datardo: scheduled tasks keep running** when the pointer rests
  on it. Its menu (`@tray`):
  1. **Open Datardo**: shows the window;
  2. **Scheduled tasks**: shows the window with the Scheduled tasks page active (`task.show`);
  3. a separator;
  4. **Quit**: `window.quit`.
- **States**: a click on the icon shows the window on Windows and Linux, and opens the menu on macOS, where a click
  on Datardo's icon in the Dock shows the window. Showing the window, from here or by starting Datardo again
  (`window.single-instance`), removes the icon. On a Linux desktop that has no tray the icon cannot be shown:
  starting Datardo again shows the window.
- **Uses**: `window.quit`, `window.single-instance`, `task.show`, `task.tray`. The system notification of a scheduled
  task that failed or was skipped while Datardo is in the tray belongs to the task area; a click on it shows the
  window.
- **Ported from**: task.tray of Mongoster, for the icon and its menu: `src/standalone/main.ts` (`hideToTray`,
  `showWindow`). **Scheduled tasks** in the menu is new.

Acceptance:

- [ ] With the window shown, the system's tray holds no icon of Datardo.
- [ ] After the window is closed into the tray, the icon is there, and resting the pointer on it shows **Datardo:
  scheduled tasks keep running**.
- [ ] The menu has exactly **Open Datardo**, **Scheduled tasks**, a separator and **Quit**, in this order.
- [ ] **Open Datardo** shows the window with the tab that was active, and the icon is gone.
- [ ] **Scheduled tasks** shows the window with the Scheduled tasks tab active.
- [ ] **Quit** quits Datardo even though scheduled tasks are enabled; with unsaved changes in a tab the window is
  shown first and asks (`window.quit`).

### `window.quit` — Quit Datardo

Quits, after asking about what would be lost: changes not saved, and work still in progress.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/window/quit.ts › plan(context, answers)`
- **Entry points**: `Ctrl+Q`; **Quit** in the tray icon's menu (`@tray`); on macOS **Datardo › Quit Datardo**
  (`@app-menu`); closing the window when it does not go to the tray (`window.close`); Go to (**Quit Datardo**); the
  system asking Datardo to quit (a logout, a shutdown).
- **Reads**: the tabs with unsaved changes, in the order of the tab strip; the work in progress, as the status line
  lists it, the runs of scheduled tasks included.
- **Asks**:
  1. for each tab with unsaved changes, in the order of the tab strip, after making it active (and showing the
     window if it was in the tray), the question of `tab.close`: *Do you want to save the changes you made to
     \<name\>?* with **Save**, **Don't save** and **Cancel**. **Cancel** on any of them stops the quit; what was
     saved before stays saved, and no tab is closed.
  2. nothing more when no work is in progress.
- **Plan**: one step `cancel <title of the work>` for each work in progress, in the order they started, then `quit
  Datardo`. With no work in progress, the single step `quit Datardo`.
- **Danger**: None with no work in progress. Confirm with work in progress: **Quit Datardo?**, the plan's steps, the
  line *Work that is cancelled stops where it is: what it has already written stays.*, and the button **Quit**.
- **Read-only**: Allowed, because it sends nothing to a deployment itself; a write in progress is stopped, not
  started.
- **Undo**: Cannot be undone: the confirmation says so. What the cancelled work had already written is in the undo
  history as far as it was recorded (`undo.record`).
- **After**: each work in progress is cancelled as `runner.cancel` does, and Datardo waits for them up to 5 seconds
  *(Datardo's choice)*; then it saves the open tabs (`tab.restore`) and the window's size and place
  (`window.remember`), closes every connection as `connection.disconnect` does, stops the MCP server, removes the
  tray icon and ends its processes. A save started by **Save** in step 1 is waited for, without a limit, before
  anything is cancelled.
- **Rules**: a dialog that is open when the quit is asked from outside the window (the tray, the Dock, the system) is
  cancelled first, as with `Esc`. A quit asked while another quit is asking is ignored. When the system is shutting
  down and gives no time to answer, Datardo quits without the answers: the unsaved text is kept as `tab.restore`
  keeps it.
- **Commands**: `window.quit`.
- **Uses**: `tab.close` (its question and its **Save**), `runner.confirm`, `runner.cancel`, `runner.progress`,
  `tab.restore`, `window.remember`, `connection.disconnect`, `mcp.server`.
- **Ported from**: *New in Datardo*. For reference, Mongoster's desktop app asks about unsaved files only, with the
  same text: `src/standalone/main.ts` (the `close` handler), `src/standalone/vscode/documents.ts`
  (`confirmCloseAll`).

Acceptance:

- [ ] With no unsaved changes and nothing in progress, `Ctrl+Q` quits at once, with no question.
- [ ] With an edited document tab of the document `_id` 7 of `shop.orders`, **Quit Datardo** makes that tab active
  and asks *Do you want to save the changes you made to orders · 7?*; **Cancel** leaves Datardo open with the edit
  in place.
- [ ] With two tabs with unsaved changes, answering **Save** to the first and **Cancel** to the second leaves both
  tabs open, the first one saved.
- [ ] With an export of `shop.orders` in progress, the confirmation **Quit Datardo?** shows the steps `cancel Export
  shop.orders` and `quit Datardo` and the button **Quit**; **Quit** cancels the export and Datardo ends within 5
  seconds.
- [ ] Dismissing that confirmation leaves the export running.
- [ ] After a quit, starting Datardo again shows the tabs that were open (`tab.restore`) and no connection is still
  open on the servers from the run before.
- [ ] **Quit** from the tray, with unsaved changes, shows the window before asking.

## About Datardo

### `window.about` — About Datardo

Says which Datardo this is, and where its documentation and its data are.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/window/about.ts › view(state)`
- **Entry points**: Go to (**About Datardo**); on macOS **Datardo › About Datardo** (`@app-menu`); **About** at the
  bottom of the Settings page (`settings.page`).
- **Shows**, in a dialog (`nav.dialog`):
  - Datardo's icon, **Datardo** and its version (`Datardo 1.0.0`);
  - what the last check for a newer version found (`window.check-update`): *Datardo 1.0.0 is the latest version.*,
    or *Datardo 1.1.0 is available.* with **Download**, or nothing when no check was made in this run; and the
    button **Check for updates**;
  - *MongoDB and Redis client. Electron \<version\>, Chromium \<version\>, Node.js \<version\>.*;
  - the system and its architecture (`Windows 11 x64`, `macOS 15.1 arm64`, `Linux 6.8 x64`);
  - the data folder, as a path, with **Open** (`window.open-data-folder`);
  - the links **Documentation** and **Report an issue** (`window.open-link`);
  - the buttons **Copy** and **Close**.
- **States**: **Copy** copies the version, the three versions of the runtime and the system as lines of text, never
  the path of the data folder, which may hold the user's name; the button then reads **Copied** for 2 seconds
  *(Datardo's choice)*. `Esc` and `Enter` close the dialog.
- **Commands**: `window.about`.
- **Uses**: `nav.dialog`, `window.open-data-folder`, `window.open-link`, `window.check-update`.
- **Ported from**: *New in Datardo*. For reference, Mongoster's desktop app has **About Mongoster**, with the text
  this card adapts, **Documentation** and **Report an issue** in its **Help** menu: `src/standalone/main.ts`
  (`buildMenu`).

Acceptance:

- [ ] **About Datardo** shows `Datardo` followed by the version of the installed package, and the versions of
  Electron, Chromium and Node.js it runs on.
- [ ] **Copy** puts on the clipboard four lines: the version of Datardo, the line of Electron, Chromium and Node.js,
  the system, and nothing that names the user or a connection.
- [ ] **Open** opens the data folder in the system's file manager and leaves the dialog open.
- [ ] **Documentation** opens the system's browser; Datardo's window still shows the dialog.
- [ ] `Esc` closes the dialog and gives the focus back to what had it.
- [ ] Opened before any check for a newer version, the dialog has **Check for updates** and no line about versions;
  after a check that found 1.1.0 while 1.0.0 runs, it shows *Datardo 1.1.0 is available.* with **Download**.

### `window.check-update` — Say when a newer version exists

Asks GitHub which is the latest release of Datardo, and tells the user when it is newer than the one that runs.
Datardo downloads nothing and installs nothing: the user does
([D44](../decisions.md#d44--datardo-says-when-a-newer-version-exists-and-installs-nothing-by-itself)).

- **Kind**: Read
- **Engine**: Any
- **Function**: `src/features/window/check-update.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: by itself when `datardo.window.checkForUpdates` is on: 10 seconds after the window shows at
  start, then every 24 hours while Datardo stays open *(Datardo's choice)*, and at once when the setting is turned
  on. **Check for updates** in About (`@dialog`) and in Go to (**Check for updates**) ask once, whatever the setting
  says.
- **Request**: sent by the main process: `GET https://api.github.com/repos/<owner>/<repository>/releases/latest`,
  for Datardo's repository (D48), with `Accept: application/vnd.github+json` and `User-Agent: Datardo/<version>`. No
  cookie, no token, and nothing that names the user, the machine or a connection. It has a time limit of 10 seconds
  *(Datardo's choice)*, and a reply over 1 MB is dropped.
- **Parse**: `tag_name` read as a version (`v1.3.0` is 1.3.0) and `html_url`. The release is newer when its version
  is greater than the one that runs, compared number by number (1.10.0 is newer than 1.9.0). A tag that is not three
  numbers gives no version. GitHub's latest release is never a draft or a pre-release.
- **Rules**:
  - A newer version shows the notification *Datardo 1.3.0 is available. You have 1.2.0.* with **Download**, once for
    each version in a run, and the same line in About until Datardo quits.
  - **Download** opens the release's page in the system's browser (`window.open-link`): `html_url` when it starts
    with the address of Datardo's repository on `https://github.com/`, the releases page of the repository
    otherwise.
  - A check that started by itself and fails (no network, a status other than 200, a reply that gives no version)
    writes one line in the Log and shows nothing; the next one is at its time. **Check for updates** always answers:
    the notification above, *Datardo 1.2.0 is the latest version.*, or *Could not check for a newer version:
    \<reason\>.*
  - Nothing is downloaded, and no file of the data folder is written.
  - This is the only request Datardo makes to the network by itself (R14.9 of the code rules). The address is a
    constant of the module; the tests give `request` another one and answer it themselves, so that no test reaches
    GitHub.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Settings**: `datardo.window.checkForUpdates`: on (the default) or off.
- **Commands**: `window.check-update`.
- **Uses**: `runner.notify`, `runner.log`, `window.open-link`, `settings.read`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] With the setting on, one request is sent 10 seconds after the window shows, to the host of the check and to no
  other, and its headers hold `Datardo/` with the version and no name of a user, a machine or a connection.
- [ ] With the setting off, no request is sent at start nor 24 hours later; turning the setting on sends one at once.
- [ ] Running 1.2.0, a reply with `"tag_name": "v1.3.0"` shows *Datardo 1.3.0 is available. You have 1.2.0.* with
  **Download**; `v1.2.0` and `v1.1.9` show nothing.
- [ ] `parse` says 1.10.0 is newer than 1.9.0, and gives no version for `"tag_name": "nightly"`, for text that is not
  JSON and for a reply with no `tag_name`.
- [ ] **Download** opens `html_url` when it starts with the repository's address; with
  `"html_url": "https://example.com/x"` it opens the releases page of the repository.
- [ ] With no network, the check at start shows no notification and writes one line in the Log; **Check for
  updates** in About then shows *Could not check for a newer version:* with the reason.
- [ ] Two checks in one run that find 1.3.0 show one notification.
- [ ] With the setting off, **Check for updates** in About sends one request and answers.
- [ ] After a check, no file of the data folder has changed and nothing was downloaded.

### `window.open-data-folder` — Open the data folder

Shows, in the system's file manager, the folder where Datardo keeps its settings, connections, undo history and
tasks.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/window/open-data-folder.ts › plan(context, answers)`
- **Entry points**: **Open** beside the data folder in About (`@dialog`); Go to (**Open data folder**).
- **Plan**: one app step, `open <the data folder> in the file manager`.
- **Rules**: the data folder is `%APPDATA%\Datardo` on Windows, `~/Library/Application Support/Datardo` on macOS and
  `~/.config/Datardo` on Linux, unless `DATARDO_DATA` names another one; the folder opened is the one in use.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment or to the folder, so nothing is recorded.
- **After**: the file manager of the system shows the folder; Datardo's window keeps the focus it had on Windows and
  Linux as far as the system allows.
- **Refuses**: the folder cannot be opened (no file manager answers): *The data folder could not be opened:
  \<path\>.* (`/failed`); the path is in the message, so that it can be copied.
- **Commands**: `window.open-data-folder`.
- **Ported from**: *New in Datardo*. The three folders are Mongoster's with the new name (README, **Desktop app**,
  **Storage**).

Acceptance:

- [ ] On Windows, **Open data folder** opens the Explorer of the system on `%APPDATA%\Datardo`.
- [ ] With `DATARDO_DATA` set to `D:\tmp\datardo-test`, it opens that folder.
- [ ] Nothing in the folder is created, changed or deleted by opening it.
- [ ] When the system cannot open it, a notification says *The data folder could not be opened:* followed by the
  path.

### `window.open-link` — Open a link in the system's browser

A link of Datardo opens in the browser of the system. The window itself never shows another site.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/window/open-link.ts › plan(context, answers)`
- **Entry points**: every link the window shows: **Documentation** and **Report an issue** in About (`@dialog`) and,
  on macOS, in the **Help** menu (`@app-menu`); a link in a notification (`@notification`); a link in the text of a
  page.
- **Plan**: one app step, `open <address> in the browser`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded.
- **Refuses**: an address that does not start with `http://` or `https://`: *Datardo opens only web links.*
  (`/scheme`).
- **Rules**: the window process never loads anything but Datardo's own pages: a link, a redirect or a script that
  asks for another address is not followed in the window, and no second window is ever opened.
- **Ported from**: *New in Datardo*. For reference, Mongoster's desktop app: `src/standalone/main.ts`
  (`setWindowOpenHandler`, `will-frame-navigate`).

Acceptance:

- [ ] **Report an issue** opens the system's default browser on the issues page of Datardo's repository; Datardo's
  window shows what it showed.
- [ ] A link to `file:///C:/Windows/win.ini` is refused with *Datardo opens only web links.* and nothing opens.
- [ ] A link to `javascript:alert(1)` is refused in the same way.
- [ ] Nothing a page does opens a second window of Datardo.

## macOS

### `window.app-menu` — The menu bar on macOS

On macOS the system's menu bar stays, with the commands a Mac user looks for there. Windows and Linux have no menu
bar: everything is in the window and in Go to.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/window/app-menu.ts › view(state)`
- **Entry points**: the system's menu bar, on macOS only (`@app-menu`).
- **Shows**, with the keys as macOS writes them:
  - **Datardo**: **About Datardo** (`window.about`); **Settings…** `Cmd+,` (`settings.page`); the system's own
    **Services**, **Hide Datardo**, **Hide Others** and **Show All**; **Quit Datardo** `Cmd+Q` (`window.quit`).
  - **File**: **Add connection…** (`connection.add`); **New playground** (`playground.open`); **Close tab** `Cmd+W`
    (`tab.close`); **Reopen closed tab** `Cmd+Shift+T` (`tab.reopen`).
  - **Edit**: the system's own **Undo**, **Redo**, **Cut**, **Copy**, **Paste** and **Select All**, which act on the
    text field or the editor that has the focus. This **Undo** is the one of the text being typed, not the undo
    history.
  - **View**: **Go to…** `Cmd+K` (`palette.open`); **Show explorer** or **Hide explorer** `Cmd+B`
    (`nav.toggle-explorer`); **Show inspector** or **Hide inspector** `Cmd+Shift+B` (`nav.toggle-inspector`);
    **Theme**, with **Follow the system**, **Dark** and **Light** (`window.theme`); **Zoom in** `Cmd+=`, **Zoom out**
    `Cmd+-`, **Reset zoom** `Cmd+0` (`window.zoom`); **Enter full screen** or **Exit full screen** `Ctrl+Cmd+F`
    (`window.full-screen`).
  - **Go**: **Back** `Cmd+[` and **Forward** `Cmd+]` (`nav.back`); **Home** `Cmd+Shift+H` (`home.show`); **Switch
    connection…** `Cmd+Shift+O` (`nav.switch-connection`); **Next tab** `Ctrl+Tab` and **Previous tab**
    `Ctrl+Shift+Tab` (`tab.activate`).
  - **Window**: the system's own **Minimize**, **Zoom** and **Bring All to Front**.
  - **Help**: **Documentation** and **Report an issue** (`window.open-link`).
- **States**: an entry is one command of `palette.commands`, with the same title and the same key, so that the menu
  never says something Go to does not. An entry whose command is not offered now is disabled (**Back** with no place
  to go back to, **New playground** without a MongoDB connection). **Theme** marks the theme in use. While a dialog
  is open every entry but those of **Datardo**, **Edit** and **Window** is disabled.
- **Uses**: the features named above, and `palette.commands`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] On macOS the menu bar shows **Datardo**, **File**, **Edit**, **View**, **Go**, **Window** and **Help**, in this
  order.
- [ ] On Windows and Linux Datardo has no menu bar, and every command of the macOS menus that is not the system's own
  is in Go to with the same title.
- [ ] Every entry that is not the system's has the title and the key `palette.commands` lists for its command.
- [ ] With the explorer hidden the **View** menu reads **Show explorer**; with it shown, **Hide explorer**.
- [ ] With a Redis connection current, **File › New playground** is disabled.
- [ ] **Edit › Undo** in a query bar undoes the last characters typed and writes nothing to a deployment.

## When the window fails

### `window.recover` — The window process crashes or stops answering

The window is drawn by a process of its own. When that process dies or hangs, Datardo says so and brings the window
back, without losing the connections or the work in progress, which live in the main process.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/window/recover.ts › view(state)`
- **Entry points**: none: it is shown by the main process, as a dialog of the system, since the window can draw
  nothing.
- **Shows**:
  - The window process is gone (it crashed, was killed or ran out of memory): the message *The window stopped
    working.*, the detail *Your connections are still open and the work in progress goes on. Reload brings the tabs
    back; text typed in the last second may be lost.*, and the buttons **Reload** and **Quit**.
  - The window process does not answer, as the system reports it: *The window is not answering.*, with **Wait** and
    **Reload**. The dialog closes by itself when the window answers again.
  - The window process was gone 3 times within 60 seconds *(Datardo's choice)*: *The window stopped working 3 times
    in a minute.*, with **Reload without the tabs** and **Quit**.
- **States**:
  - **Reload** creates the window again, in the same place and size, and restores the tabs with their unsaved text
    as `tab.restore` saved them, whatever `datardo.tab.restore` says. The current connection is the one it was. Not
    restored: the places of Back and Forward (`nav.back`), the selection, a dialog that was open, whose question
    counts as cancelled.
  - **Reload without the tabs** creates the window with the Home tab only; the unsaved text stays saved for the next
    start.
  - **Quit** quits without asking about unsaved changes, since nothing can ask; the unsaved text stays saved for the
    next start (`tab.restore`).
  - **Wait** closes the dialog; it comes back after 30 seconds *(Datardo's choice)* if the window still does not
    answer.
  - While the window is gone, the connections stay connected, work in progress and scheduled tasks go on, and the MCP
    server answers.
  - A window hidden in the tray that is gone shows no dialog: it is created again when it is next shown.
  - Each time, the Log gets a line (`runner.log`): `[window.recover] the window process is gone: crashed`, with the
    reason the system gives (`crashed`, `killed`, `oom`) and, for a hang, `[window.recover] the window process does
    not answer`.
- **Uses**: `tab.restore`, `window.placement`, `window.quit`, `runner.log`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] Killing the window process while a backup is in progress shows *The window stopped working.*; the backup
  finishes and its archive is complete.
- [ ] **Reload** shows the window with the same tabs in the same order, the same tab active, and the connection that
  was connected still connected, without connecting again.
- [ ] A playground tab with text typed 5 seconds before the crash and never saved comes back with that text, marked
  as unsaved.
- [ ] A confirmation that was open when the process died is not confirmed: its write was never sent.
- [ ] Killing the window process three times in 30 seconds shows the third time *The window stopped working 3 times
  in a minute.* with **Reload without the tabs**, which opens the window on Home.
- [ ] A window that hangs and then answers again within the time of the dialog makes the dialog go away by itself.
- [ ] After a crash the Log page lists one line that starts with `[window.recover]`.
