/**
 * The part of the app's state that holds the settings the user changed, as `settings.json` stores them. The value of
 * a setting is `settings.read`'s, from these and the schema's defaults.
 */
import type { Json } from '../engine-request';

/** The settings the user changed, by full name, and whether they can be saved (data.md, "Versions"). */
export interface SettingsState {
  readonly stored: Readonly<Record<string, Json>>;
  /** False when `settings.json` was written by a newer Datardo: changes are refused (`settings.change/newer-version`). */
  readonly writable: boolean;
}

/** The events of this part of the state. */
export type SettingsEvent =
  | {
      readonly slice: 'settings';
      readonly type: 'loaded';
      readonly stored: Readonly<Record<string, Json>>;
      readonly writable: boolean;
    }
  | { readonly slice: 'settings'; readonly type: 'changed'; readonly name: string; readonly value: Json | undefined };

/** No setting changed. */
export const initialSettingsState: SettingsState = { stored: {}, writable: true };

/** Changes this part of the state. A value of `undefined` puts the default back. */
export function reduceSettings(state: SettingsState, event: SettingsEvent): SettingsState {
  switch (event.type) {
    case 'loaded':
      return { stored: event.stored, writable: event.writable };
    case 'changed': {
      const stored = Object.fromEntries(Object.entries(state.stored).filter(([name]) => name !== event.name));
      return { ...state, stored: event.value === undefined ? stored : { ...stored, [event.name]: event.value } };
    }
  }
}
