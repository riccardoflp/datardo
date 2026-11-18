/**
 * Feature: window.open-link
 *
 * A link of Datardo opens in the browser of the system. The window itself never shows another site.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { refuse, run } from '../../shared/feature';
import { windowText } from './text';
import { appStep, startedWith, windowPlan } from './types';

/** Whether an address is a web link, the only kind Datardo opens: it starts with `http://` or `https://`. */
export function isWebLink(address: string): boolean {
  return /^https?:\/\/[^\s]+$/iu.test(address.trim());
}

/** The address the feature was started with: a text, or `{ address }`. */
function addressOf(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value !== null && typeof (value as { address?: unknown }).address === 'string') {
    return (value as { address: string }).address;
  }
  return '';
}

/**
 * Feature: window.open-link
 *
 * One app step, `open <address> in the browser`. Anything but a web link is refused (`/scheme`).
 */
export function plan(_context: Context, answers: Answers): Outcome {
  const address = addressOf(startedWith(answers)).trim();
  if (!isWebLink(address)) {
    return refuse('window.open-link/scheme', windowText.onlyWebLinks);
  }
  return run(windowPlan('Open link', [appStep(`open ${address} in the browser`, 'window.open-link', { address })]));
}
