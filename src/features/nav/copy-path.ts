/**
 * Feature: nav.copy-path
 *
 * Copies the name of what the active tab shows, as the engine writes it, never naming the connection: `shop.orders`,
 * `orders:2026:*`, `orders:2026:42`, `Monitor`.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { pathSegments } from './path';
import { text } from './text';
import { appPlan, appStep, navInput, type NavInput, type TabShows } from './types';

/** How much of the copied text the notification shows (Datardo's choice). */
export const notificationLength = 80;

/** The text Copy path copies for what a tab shows, or `undefined` for a tab of the app, which has none. */
export function copiedText(tab: TabShows): string | undefined {
  switch (tab.kind) {
    case 'app':
      return undefined;
    case 'collection':
    case 'document':
      return `${tab.database}.${tab.collection}`;
    case 'keys':
      return tab.namespace === undefined ? `db${String(tab.database)}` : `${tab.namespace}*`;
    case 'key':
      return tab.key;
    case 'page':
    case 'playground':
    case 'console':
      return pathSegments(tab, [])
        .slice(1)
        .map((segment) => segment.label)
        .join(' / ');
  }
}

/** Whether Copy path is offered: the active tab belongs to a connection. */
export function isOffered(tab: TabShows): boolean {
  return copiedText(tab) !== undefined;
}

/** The text as the notification says it: cut at 80 characters. */
export function notified(copied: string): string {
  return copied.length > notificationLength ? `${copied.slice(0, notificationLength)}…` : copied;
}

/** The plan for the nav input given: nothing on a tab of the app. */
export function planFor(input: NavInput): Outcome {
  const copied = copiedText(input.activeTab);
  if (copied === undefined) {
    return run(appPlan('Copy path', []));
  }
  return run(
    appPlan(
      'Copy path',
      [appStep(`copy ${copied} to the clipboard`, 'nav.copy', { text: copied })],
      [{ kind: 'notify', level: 'success', text: text.copyPath.copied(notified(copied)) }],
    ),
  );
}

/** Copies the path of the active tab. */
export function plan(context: Context, _answers: Answers): Outcome {
  return planFor(navInput(context.state));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('nav.copy-path'), plan };
