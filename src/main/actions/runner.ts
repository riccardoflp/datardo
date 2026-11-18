/**
 * The actions of the runner area the runner carries out for app steps and app reads: copying a text to the clipboard
 * (what follows a plan), and the request of the check for a newer version, the one request Datardo sends to the
 * network by itself (`window.check-update`, R14.9).
 */
import { clipboard } from 'electron';
import type { AreaActions } from '.';
import type { Json } from '../../shared/engine-request';
import { copyAction } from '../../runner/after';
import { fetchReleaseAction } from '../../features/window/check-update';
import { fetchLatestRelease } from '../check-update';

/** The actions of this area, by name. */
export const actions: AreaActions = () => ({
  [copyAction]: (args: Json) => {
    const text =
      typeof args === 'object' && args !== null && !Array.isArray(args)
        ? (args as Record<string, Json>)['text']
        : undefined;
    return Promise.resolve(clipboard.writeText(typeof text === 'string' ? text : ''));
  },
  [fetchReleaseAction]: fetchLatestRelease,
});
