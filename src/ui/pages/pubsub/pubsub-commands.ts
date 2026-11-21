/**
 * The commands of the Pub/Sub area that act on what the window alone knows of the active Pub/Sub tab, carried out the
 * same way for their keys and their rows in Go to (`palette.run-command`): **Copy message**, **Copy channel**, **Copy
 * as JSON** and **Copy as PUBLISH command** copy the rows selected (`pubsub.copy`); **Export Pub/Sub messages…**
 * offers the rows selected and those the filter shows (`pubsub.export`).
 */
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import type { Json } from '../../../shared/engine-request';
import { featureId } from '../../../shared/ids';
import { startIntent } from '../../shell/top-bar/start';
import { exportArgs, pageTarget } from './pubsub-actions';
import { pageOfTab } from './pubsub-state';
import { pubsubTabOf } from './pubsub-store';

/** The variant of each copy command. */
const copies: Readonly<Record<string, string>> = {
  'pubsub.copy:message': 'message',
  'pubsub.copy:channel': 'channel',
  'pubsub.copy:json': 'json',
  'pubsub.copy:command': 'command',
};

/** Whether a command is one this module carries out, on an active Pub/Sub tab. */
export function isPubSubCommand(id: string, state: AppState): boolean {
  const active = activeTabOf(state.tabs);
  const onPage = active?.shows.kind === 'page' && active.shows.page === 'pubsub';
  return onPage && pubsubTabOf(active.id) !== undefined && (id === 'pubsub.export' || copies[id] !== undefined);
}

/** Carries out a command on the active Pub/Sub tab. */
export function runPubSubCommand(id: string, state: AppState): void {
  const active = activeTabOf(state.tabs);
  const tab = active === undefined ? undefined : pubsubTabOf(active.id);
  const page = tab === undefined ? undefined : pageOfTab(state, tab);
  if (tab === undefined || page === undefined) {
    return;
  }
  const variant = copies[id];
  const target = pageTarget(tab.connection);
  const start = (feature: string, args: Json): void => {
    startIntent({ feature: featureId(feature), target, args });
  };
  if (variant !== undefined) {
    start('pubsub.copy', { variant, rows: [...page.selected] });
  } else if (id === 'pubsub.export') {
    start('pubsub.export', exportArgs(tab, page.selected));
  }
}
