/**
 * The keys of the shell: every command's key is read in one place (`useCommandKeys`, `palette.key-press`), and the
 * mouse's back and forward buttons go back and forward (`nav.back`), but not while a dialog is open.
 */
import { useEffect } from 'react';
import { useCommandKeys } from '../palette/command-keys';
import { isDialogOpen } from './focus';
import { startFeature } from './intent';

/** Listens to the keys and the mouse buttons of the shell while the window is open. */
export function useShellKeys(openSwitcher: () => void): void {
  useCommandKeys(openSwitcher);
  useEffect(() => {
    const mouse = (event: MouseEvent): void => {
      if ((event.button === 3 || event.button === 4) && !isDialogOpen()) {
        event.preventDefault();
        startFeature('nav.back', { args: { direction: event.button === 3 ? 'back' : 'forward' } });
      }
    };
    window.addEventListener('mouseup', mouse);
    return () => {
      window.removeEventListener('mouseup', mouse);
    };
  }, []);
}
