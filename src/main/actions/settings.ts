/**
 * The actions of the settings area the runner carries out for app steps and app reads.
 *
 * `settings.write` writes one setting, `{ name, value }`; a `value` of `null` removes it from `settings.json`, which
 * puts its default back. It is what `settings.change` and `settings.reset` plan, and what the features with a control
 * of their own for one setting plan too (the theme, the zoom).
 */
import type { AreaActions } from '.';
import type { Json } from '../../shared/engine-request';
import { writeSettingAction } from '../../features/settings/change';
import { writeSetting } from '../settings';

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  [writeSettingAction]: (args: Json) => {
    const record = typeof args === 'object' && args !== null && !Array.isArray(args) ? args : {};
    const name = (record as Record<string, Json>)['name'];
    if (typeof name !== 'string') {
      return Promise.reject(new Error('settings.write needs the name of a setting.'));
    }
    writeSetting(services, name, (record as Record<string, Json>)['value'] ?? null);
    return Promise.resolve();
  },
});
