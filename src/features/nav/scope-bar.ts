/**
 * Feature: nav.scope-bar
 *
 * The row under the tab strip that says where the active tab is and takes the user somewhere else from there: Back
 * and Forward, the path, then Copy path, Pin or Unpin, and Open on another connection.
 */
import type { Json } from '../../shared/engine-request';
import { canGo } from './back';
import { isOffered as isCopyOffered } from './copy-path';
import { disabledReason, isShownOn } from './open-on-another-connection';
import { view as pathView, type PathView } from './path';
import { isSamePin, pinOfTab } from './pin';
import { text } from './text';
import { tabConnection, type NavInput } from './types';

/** A button of the scope bar. */
export interface ScopeButton {
  readonly label: string;
  readonly icon: string;
  readonly element: string;
  readonly feature: string;
  readonly args?: Json;
  readonly disabled?: boolean;
  /** Why it is disabled, shown when the pointer rests on it. */
  readonly tooltip?: string;
}

/** The scope bar. */
export interface ScopeBarView {
  readonly label: string;
  readonly back: ScopeButton;
  readonly forward: ScopeButton;
  readonly path: PathView;
  readonly copyPath?: ScopeButton;
  readonly pin?: ScopeButton;
  readonly openOnAnother?: ScopeButton;
}

function pinButton(input: NavInput): ScopeButton | undefined {
  const pin = pinOfTab(input.activeTab);
  const connection = tabConnection(input.activeTab);
  if (pin === undefined || connection === undefined) {
    return undefined;
  }
  const pinned = (input.nav.pins[connection] ?? []).some((each) => isSamePin(each, pin));
  return {
    label: pinned ? text.scopeBar.unpin : text.scopeBar.pin,
    icon: pinned ? 'pinned' : 'pin',
    element: 'nav.pin@scope-bar',
    feature: 'nav.pin',
    args: { action: pinned ? 'unpin' : 'pin', connection, pin: pin as unknown as Json },
  };
}

function openButton(input: NavInput): ScopeButton | undefined {
  if (!isShownOn(input.activeTab)) {
    return undefined;
  }
  const reason = disabledReason(input);
  return {
    label: text.scopeBar.openOnAnother,
    icon: 'arrow-swap',
    element: 'nav.open-on-another-connection@scope-bar',
    feature: 'nav.open-on-another-connection',
    ...(reason === undefined ? {} : { disabled: true, tooltip: reason }),
  };
}

/** The scope bar for the nav input given. */
export function view(input: NavInput): ScopeBarView {
  const back = canGo(input, 'back');
  const forward = canGo(input, 'forward');
  const pin = pinButton(input);
  const open = openButton(input);
  return {
    label: text.scopeBar.label,
    back: {
      label: text.scopeBar.back,
      icon: 'arrow-left',
      element: 'nav.back@scope-bar',
      feature: 'nav.back',
      args: { direction: 'back' },
      disabled: !back,
    },
    forward: {
      label: text.scopeBar.forward,
      icon: 'arrow-right',
      element: 'nav.back@scope-bar',
      feature: 'nav.back',
      args: { direction: 'forward' },
      disabled: !forward,
    },
    path: pathView(input),
    ...(isCopyOffered(input.activeTab)
      ? {
          copyPath: {
            label: text.scopeBar.copyPath,
            icon: 'copy',
            element: 'nav.copy-path@scope-bar',
            feature: 'nav.copy-path',
          },
        }
      : {}),
    ...(pin === undefined ? {} : { pin }),
    ...(open === undefined ? {} : { openOnAnother: open }),
  };
}
