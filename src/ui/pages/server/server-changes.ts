/**
 * What the user changes on a Server page tab: the section (`server.show` with `{ section }`, which the tab keeps), the
 * choices of the controls (kept with the tab by `server.show` with `{ choices }` once they settle, while the tab is the
 * active tab), and what is selected in each section, which the window alone keeps.
 */
import { choicesRecord, type ServerChoices } from '../../../features/server/show';
import type { ServerSection } from '../../../features/server/types';
import { startFeature } from '../../shell/intent';
import { changeServerTab, serverTabOf, type ServerSelection } from './server-store';

/** How long the choices stay unchanged before the tab keeps them, in ms (Datardo's choice). */
const settleMs = 600;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const held = new Set<string>();

function keepChoices(tab: string): void {
  timers.delete(tab);
  const state = serverTabOf(tab);
  if (state !== undefined) {
    startFeature('server.show', {
      place: 'toolbar',
      target: { kind: 'connection', connection: state.connection },
      args: { choices: choicesRecord(state.choices) },
    });
  }
}

/** Changes the choices of a tab; the tab keeps them once they settle. */
export function changeChoices(tab: string, change: (choices: ServerChoices) => ServerChoices): void {
  changeServerTab(tab, (state) => ({ ...state, choices: change(state.choices) }));
  const timer = timers.get(tab);
  if (timer !== undefined) {
    clearTimeout(timer);
  }
  timers.set(
    tab,
    setTimeout(() => {
      keepChoices(tab);
    }, settleMs),
  );
}

/** The tab stops being shown: choices not kept yet wait until it is shown again, so that no other tab is left. */
export function holdChoices(tab: string): void {
  const timer = timers.get(tab);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(tab);
    held.add(tab);
  }
}

/** The tab is shown again: the choices it held are kept now. */
export function keepHeldChoices(tab: string): void {
  if (held.delete(tab)) {
    keepChoices(tab);
  }
}

/** Shows another section: the tab keeps it, and the page reads it once the tab says so. */
export function chooseSection(tab: string, section: ServerSection): void {
  const state = serverTabOf(tab);
  if (state !== undefined) {
    startFeature('server.show', {
      place: 'section-bar',
      target: { kind: 'connection', connection: state.connection },
      args: { section },
    });
  }
}

/** Selects in a section of the tab, in place of what was selected there. */
export function select(tab: string, change: (selected: ServerSelection) => ServerSelection): void {
  changeServerTab(tab, (state) => ({ ...state, selected: change(state.selected) }));
}
