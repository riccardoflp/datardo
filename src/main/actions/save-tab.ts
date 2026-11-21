/**
 * `tab.save`, the step of a close that saves the tab first (`tab.close`): a playground through `playground.save`, a
 * document through `document.save`, or `document.insert-from-tab` for a new one. One action for every kind of tab,
 * since an action has one area.
 */
import type { Json } from '../../shared/engine-request';
import { tabId } from '../../shared/ids';
import type { MainServices } from '../services';
import { savePlaygroundTab } from './playground';
import { saveDocumentTab } from './tab';
import type { AreaActions } from '.';

/** The kind of what a tab shows, when the tab is open. */
function shownKind(services: MainServices, args: Json): string | undefined {
  const id =
    typeof args === 'object' && args !== null && !Array.isArray(args)
      ? (args as Record<string, Json>)['tab']
      : undefined;
  if (typeof id !== 'string') {
    return undefined;
  }
  const wanted = tabId(id);
  return services.state.get().tabs.tabs.find((tab) => tab.id === wanted)?.shows.kind;
}

/** The one `tab.save` action. */
export const actions: AreaActions = (services) => ({
  'tab.save': (args, signal) =>
    shownKind(services, args) === 'playground'
      ? savePlaygroundTab(services, args, signal)
      : saveDocumentTab(services, args),
});
