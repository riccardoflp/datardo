/**
 * `Ctrl` with the mouse wheel (`window.zoom`), `Cmd` on macOS. The keys of the window area's commands are read with
 * every other command's, in one place (`palette.key-press`).
 */
import { useEffect } from 'react';
import { commandIntent } from '../../../features/window/app-menu';
import type { Platform } from '../../../shared/feature';
import { startIntent } from './start';

/** How long a turn of the wheel waits before the next one zooms again, so that a trackpad's stream zooms one step. */
const wheelPauseMs = 120;

/** Takes the wheel of the window area while the window is open. */
export function useWindowKeys(platform: Platform): void {
  useEffect(() => {
    let lastWheel = 0;
    const onWheel = (event: WheelEvent): void => {
      const zooming = platform === 'macos' ? event.metaKey : event.ctrlKey;
      if (!zooming || event.deltaY === 0) {
        return;
      }
      event.preventDefault();
      if (event.timeStamp - lastWheel < wheelPauseMs) {
        return;
      }
      lastWheel = event.timeStamp;
      startIntent(commandIntent(event.deltaY < 0 ? 'window.zoom:in' : 'window.zoom:out'));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', onWheel);
    };
  }, [platform]);
}
