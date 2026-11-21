/**
 * The actions of the app the runner carries out for app steps and app reads, by name (`window.set-zoom`). Each area
 * that has some writes them in `src/main/actions/<area>.ts` as a function of the {@link MainServices}; a new area adds
 * one line to the list below.
 */
import type { AppAction } from '../../runner/ports';
import type { MainServices } from '../services';
import { actions as windowActions } from './window';
import { actions as navActions } from './nav';
import { actions as runnerActions } from './runner';
import { actions as settingsActions } from './settings';
import { actions as connectionActions } from './connection';
import { actions as connectionOrganizeActions } from './connection-organize';
import { actions as tabActions } from './tab';
import { actions as paletteActions } from './palette';
import { actions as homeActions } from './home';
import { actions as undoActions } from './undo';
import { actions as tableActions } from './table';
import { actions as keyActions } from './key';
import { actions as consoleActions } from './console';

/** The actions of one area, by name. */
export type AreaActions = (services: MainServices) => Readonly<Record<string, AppAction>>;

/** The areas that have actions. */
const areas: readonly AreaActions[] = [
  windowActions,
  navActions,
  runnerActions,
  settingsActions,
  connectionActions,
  connectionOrganizeActions,
  tabActions,
  paletteActions,
  homeActions,
  undoActions,
  tableActions,
  keyActions,
  consoleActions,
];

/** Every action of every area, by name; two areas never name an action alike. */
export function appActions(services: MainServices): ReadonlyMap<string, AppAction> {
  const actions = new Map<string, AppAction>();
  for (const area of areas) {
    for (const [name, action] of Object.entries(area(services))) {
      if (actions.has(name)) {
        throw new Error(`Two areas name an action ${name}.`);
      }
      actions.set(name, action);
    }
  }
  return actions;
}
