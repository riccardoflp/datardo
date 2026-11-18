/**
 * Feature: window.about
 *
 * Says which Datardo this is, and where its documentation and its data are.
 */
import type { Intent } from '../../shared/bridge';
import { featureId } from '../../shared/ids';
import { product, type Product } from '../../shared/product';
import type { AppState } from '../../shared/state';
import { appTarget } from '../../shared/target';
import { documentationAddress, issuesAddress } from './app-menu';
import { appName, runtimeLine, windowText } from './text';

/** A link of About, which opens in the system's browser (`window.open-link`). */
export interface AboutLink {
  readonly title: string;
  readonly element: string;
  readonly intent: Intent;
}

/** What About shows, in order, and what its controls start. */
export interface AboutView {
  readonly title: string;
  /** `Datardo 1.0.0`. */
  readonly name: string;
  /** What the last check for a newer version found, absent when none was made in this run. */
  readonly update?: { readonly text: string; readonly download?: AboutLink };
  /** **Check for updates**, offered when Datardo knows its repository. */
  readonly check?: { readonly title: string; readonly element: string; readonly intent: Intent };
  /** *MongoDB and Redis client. Electron …, Chromium …, Node.js ….* */
  readonly runtime: string;
  /** `Windows 11 x64`. */
  readonly system: string;
  readonly dataFolder: {
    readonly label: string;
    readonly path: string;
    readonly open: { readonly title: string; readonly element: string; readonly intent: Intent };
  };
  /** **Documentation** and **Report an issue**, when Datardo knows its repository. */
  readonly links: readonly AboutLink[];
  /** What **Copy** puts on the clipboard: never the data folder, which may hold the user's name. */
  readonly copyText: string;
  readonly copy: string;
  readonly copied: string;
  readonly close: string;
}

/** How long **Copy** reads **Copied** (Datardo's choice). */
export const copiedMs = 2000;

function intent(feature: string, args?: { readonly address: string }): Intent {
  return {
    feature: featureId(feature),
    target: appTarget,
    place: 'dialog',
    ...(args === undefined ? {} : { args }),
  };
}

function link(title: string, address: string): AboutLink {
  return { title, element: 'window.open-link@dialog', intent: intent('window.open-link', { address }) };
}

/** What the last check for a newer version found, as About shows it. */
export type UpdateCheck =
  | { readonly kind: 'latest'; readonly version: string }
  | { readonly kind: 'available'; readonly version: string; readonly address: string };

/**
 * What `window.check-update` keeps until Datardo quits, under its identifier in `state.runner.remembered`: the newer
 * version and the page of its release (`{ version, current, page }`), or `{ kind: 'latest', version }`.
 */
export function updateCheckOf(state: AppState, repository: string | undefined): UpdateCheck | undefined {
  const kept = state.runner.remembered['window.check-update'];
  if (typeof kept !== 'object' || kept === null || Array.isArray(kept)) {
    return undefined;
  }
  const { kind, version, page } = kept as Readonly<Record<string, unknown>>;
  if (typeof version !== 'string') {
    return undefined;
  }
  if (kind === 'latest') {
    return { kind, version };
  }
  const address = typeof page === 'string' ? page : repository === undefined ? undefined : `${repository}/releases`;
  return address === undefined ? undefined : { kind: 'available', version, address };
}

function updateLine(state: AppState, repository: string | undefined): AboutView['update'] {
  const check = updateCheckOf(state, repository);
  if (check === undefined) {
    return undefined;
  }
  if (check.kind === 'latest') {
    return { text: `${appName} ${check.version} is the latest version.` };
  }
  return {
    text: `${appName} ${check.version} is available.`,
    download: link(windowText.aboutDownload, check.address),
  };
}

/**
 * Feature: window.about
 *
 * Datardo's name and version, what the last check for a newer version found and **Check for updates**, the runtime,
 * the system, the data folder with **Open**, **Documentation** and **Report an issue**, **Copy** and **Close**.
 */
export function view(state: AppState, known: Product = product): AboutView {
  const { app } = state;
  const { repository } = known;
  const name = `${appName} ${app.version}`;
  const runtime = `${windowText.aboutClient} ${runtimeLine(app.runtime)}`;
  const update = updateLine(state, repository);
  return {
    title: windowText.aboutTitle,
    name,
    ...(update === undefined ? {} : { update }),
    ...(repository === undefined
      ? {}
      : {
          check: {
            title: windowText.aboutCheck,
            element: 'window.check-update@dialog',
            intent: intent('window.check-update'),
          },
        }),
    runtime,
    system: app.system,
    dataFolder: {
      label: windowText.aboutDataFolder,
      path: app.dataFolder,
      open: {
        title: windowText.aboutOpen,
        element: 'window.open-data-folder@dialog',
        intent: intent('window.open-data-folder'),
      },
    },
    links:
      repository === undefined
        ? []
        : [
            link(windowText.aboutDocumentation, documentationAddress(repository)),
            link(windowText.aboutReportIssue, issuesAddress(repository)),
          ],
    copyText: [name, windowText.aboutClient, runtimeLine(app.runtime), app.system].join('\n'),
    copy: windowText.aboutCopy,
    copied: windowText.aboutCopied,
    close: windowText.aboutClose,
  };
}
