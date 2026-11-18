/**
 * `window.tray` in the main process: the icon in the system's tray while Datardo runs without its window, and its
 * menu. It is there only while the window is hidden because closing it kept Datardo running.
 */
import { Menu, Tray, nativeImage, type NativeImage } from 'electron';
import { view, type TrayEntry } from '../features/window/tray';
import type { Intent } from '../shared/bridge';
import type { Platform } from '../shared/feature';
import type { AppState } from '../shared/state';

/** The color of Datardo's icon: the accent of the dark theme (`--color-accent`). */
const iconColor = { red: 0x6e, green: 0xa8, blue: 0xfe };

/**
 * Datardo's icon, drawn as a ring: twice the size asked, for screens that scale by two. Drawn here, so that nothing
 * is read from a file that a packaged build might not ship.
 */
export function datardoIcon(size: number): NativeImage {
  const scale = 2;
  const side = size * scale;
  const pixels = Buffer.alloc(side * side * 4);
  const center = (side - 1) / 2;
  const outer = side / 2 - 0.5;
  const inner = outer * 0.5;
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const distance = Math.hypot(x - center, y - center);
      const alpha = Math.max(0, Math.min(1, outer - distance + 0.5)) * Math.max(0, Math.min(1, distance - inner + 0.5));
      const offset = (y * side + x) * 4;
      pixels[offset] = iconColor.blue;
      pixels[offset + 1] = iconColor.green;
      pixels[offset + 2] = iconColor.red;
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  return nativeImage.createFromBitmap(pixels, { width: side, height: side, scaleFactor: scale });
}

/** The tray icon, when it is shown. */
export class TrayIcon {
  private tray: Tray | undefined;

  /** Starts features with what the entries of the menu send. */
  constructor(
    private readonly platform: Platform,
    private readonly start: (intents: readonly Intent[]) => void,
  ) {}

  /** Whether the icon is in the tray. */
  isShown(): boolean {
    return this.tray !== undefined;
  }

  /** Shows the icon with its menu; does nothing when it is there already. */
  show(state: AppState): void {
    if (this.tray !== undefined) {
      return;
    }
    const shown = view(state);
    const tray = new Tray(datardoIcon(shown.iconSize));
    tray.setToolTip(shown.tooltip);
    tray.setContextMenu(Menu.buildFromTemplate(shown.entries.map((entry) => this.menuItem(entry))));
    if (this.platform !== 'macos') {
      tray.on('click', () => {
        this.start(shown.click);
      });
    }
    this.tray = tray;
  }

  /** Takes the icon away: the window is shown again, or Datardo quits. */
  hide(): void {
    this.tray?.destroy();
    this.tray = undefined;
  }

  private menuItem(entry: TrayEntry): Electron.MenuItemConstructorOptions {
    if (entry.kind === 'separator') {
      return { type: 'separator' };
    }
    return {
      label: entry.title,
      ...(entry.element === undefined ? {} : { id: entry.element }),
      click: () => {
        this.start(entry.intents);
      },
    };
  }
}
