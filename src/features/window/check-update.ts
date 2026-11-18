/**
 * Feature: window.check-update
 *
 * Asks GitHub which is the latest release of Datardo, and says when it is newer than the one that runs. Datardo
 * downloads nothing and installs nothing (D44). This is the only request Datardo makes to the network by itself
 * (R14.9): the address is a constant of this module, and the tests give `request` another one.
 */
import type { Json } from '../../shared/engine-request';
import type { After, Context, ReadRequest } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { product } from '../../shared/product';
import { appTarget } from '../../shared/target';

/** The address of GitHub's API for the repositories. */
export const githubApi = 'https://api.github.com/repos/';

/** The app action of the main process that sends the request and reads the reply. */
export const fetchReleaseAction = 'window.fetch-latest-release';

/** A time limit of 10 seconds (Datardo's choice). */
export const timeLimitMs = 10_000;

/** A reply over 1 MB is dropped (Datardo's choice). */
export const largestReplyBytes = 1_048_576;

/** The key under which the newer version found is kept until Datardo quits, for About. */
export const newerVersionKey = 'window.check-update';

/** Who asked: Datardo by itself (at start, every 24 hours, when the setting is turned on), or the user. */
export type CheckBy = 'start' | 'user';

/** What the check is started with. The tests give the address and the repository; nothing else does. */
export interface CheckArgs {
  readonly by: CheckBy;
  readonly address?: string;
  readonly repository?: string;
}

/** What the main process sends, as the app action receives it. */
export interface ReleaseRequest {
  /** `null` when no repository is known: nothing is sent. */
  readonly url: string | null;
  readonly userAgent: string;
  readonly timeLimitMs: number;
  readonly largestReplyBytes: number;
}

/** What the app action replies: the status and the text of the reply, or why there is none. */
export type ReleaseReply =
  | { readonly kind: 'reply'; readonly status: number; readonly body: string }
  | { readonly kind: 'no-request' }
  | { readonly kind: 'error'; readonly reason: 'network' | 'timed-out' | 'too-large' };

/** A version, number by number: 1.10.0 is `[1, 10, 0]`. */
export type Version = readonly [number, number, number];

/** What the check found. */
export type CheckResult =
  | { readonly kind: 'release'; readonly by: CheckBy; readonly version: string; readonly page?: string }
  | { readonly kind: 'failed'; readonly by: CheckBy; readonly reason: string }
  | { readonly kind: 'not-asked'; readonly by: CheckBy };

/** The texts of the check, word for word from its card. */
export const checkUpdateText = {
  download: 'Download',
  available: (version: string, current: string): string => `Datardo ${version} is available. You have ${current}.`,
  latest: (current: string): string => `Datardo ${current} is the latest version.`,
  couldNotCheck: (reason: string): string => `Could not check for a newer version: ${reason}.`,
  noRepository: 'this build of Datardo does not know its repository',
  network: 'the network could not be reached',
  timedOut: 'GitHub did not answer within 10 seconds',
  tooLarge: 'the reply is over 1 MB',
  status: (status: number): string => `GitHub answered with the status ${String(status)}`,
  noVersion: 'the reply gives no version',
} as const;

/** The checks's arguments, from what the feature was started with. */
export function checkArgs(args: Json): CheckArgs {
  const record =
    typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Record<string, Json>) : {};
  const text = (name: string): string | undefined => {
    const value = record[name];
    return typeof value === 'string' ? value : undefined;
  };
  const address = text('address');
  const repository = text('repository');
  return {
    by: record['by'] === 'start' ? 'start' : 'user',
    ...(address === undefined ? {} : { address }),
    ...(repository === undefined ? {} : { repository }),
  };
}

/** The address of the latest release of a repository: `https://api.github.com/repos/<owner>/<name>/releases/latest`. */
export function releaseAddress(repository: string): string | undefined {
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/?$/u.exec(repository);
  return match === null ? undefined : `${githubApi}${match[1] ?? ''}/${match[2] ?? ''}/releases/latest`;
}

/** Feature: window.check-update. `GET …/releases/latest`, with `Datardo/<version>` and nothing that names the user. */
export function request(context: Context, args: Json): ReadRequest {
  const check = checkArgs(args);
  const repository = check.repository ?? product.repository;
  const url = check.address ?? (repository === undefined ? undefined : releaseAddress(repository));
  const sent: ReleaseRequest = {
    url: url ?? null,
    userAgent: `Datardo/${context.state.app.version}`,
    timeLimitMs,
    largestReplyBytes,
  };
  return { kind: 'app', action: fetchReleaseAction, args: { ...sent } };
}

/** Feature: window.check-update. The version of the latest release and its page, or why there is none. */
export function parse(replies: readonly unknown[], args: Json): CheckResult {
  const check = checkArgs(args);
  const reply = replies[0] as ReleaseReply | undefined;
  const by = check.by;
  if (reply === undefined || reply.kind === 'no-request') {
    return { kind: 'not-asked', by };
  }
  if (reply.kind === 'error') {
    const reasons = {
      network: checkUpdateText.network,
      'timed-out': checkUpdateText.timedOut,
      'too-large': checkUpdateText.tooLarge,
    };
    return { kind: 'failed', by, reason: reasons[reply.reason] };
  }
  if (reply.status !== 200) {
    return { kind: 'failed', by, reason: checkUpdateText.status(reply.status) };
  }
  const release = releaseOf(reply.body);
  const version = release === undefined ? undefined : versionOf(release.tag);
  if (release === undefined || version === undefined) {
    return { kind: 'failed', by, reason: checkUpdateText.noVersion };
  }
  const repository = check.repository ?? product.repository;
  const page = repository === undefined ? undefined : pageOf(repository, release.page);
  return { kind: 'release', by, version: version.join('.'), ...(page === undefined ? {} : { page }) };
}

function releaseOf(body: string): { readonly tag: string; readonly page?: string } | undefined {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    // A reply that is not JSON gives no version: the check says so.
    return undefined;
  }
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const tag = record['tag_name'];
  const page = record['html_url'];
  return typeof tag === 'string' ? { tag, ...(typeof page === 'string' ? { page } : {}) } : undefined;
}

/** `html_url` when it is a page of the repository, the releases page of the repository otherwise. */
function pageOf(repository: string, page: string | undefined): string {
  return page !== undefined && page.startsWith(`${repository}/`) ? page : `${repository}/releases`;
}

/** A tag read as a version, `v1.3.0` as 1.3.0; a tag that is not three numbers gives none. */
export function versionOf(tag: string): Version | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/u.exec(tag.trim());
  if (match === null) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Whether `version` is newer than `current`, number by number: 1.10.0 is newer than 1.9.0. */
export function isNewer(version: Version, current: Version): boolean {
  for (let index = 0; index < 3; index += 1) {
    if (version[index] !== current[index]) {
      return (version[index] ?? 0) > (current[index] ?? 0);
    }
  }
  return false;
}

/** The newer version kept for About until Datardo quits: *Datardo 1.3.0 is available. You have 1.2.0.* */
export function newerVersionLine(remembered: Readonly<Record<string, Json>>): string | undefined {
  const kept = remembered[newerVersionKey];
  if (typeof kept !== 'object' || kept === null || Array.isArray(kept)) {
    return undefined;
  }
  const { version, current } = kept as Record<string, Json>;
  return typeof version === 'string' && typeof current === 'string'
    ? checkUpdateText.available(version, current)
    : undefined;
}

/**
 * What follows the check: the notification of a newer version once for each version in a run (always when the user
 * asked), the answer to **Check for updates**, or one line in the Log for a check by itself that failed.
 */
export function after(result: unknown, context: Context): readonly After[] {
  const found = result as CheckResult;
  const current = context.state.app.version;
  switch (found.kind) {
    case 'not-asked':
      return found.by === 'user'
        ? [answer('warning', checkUpdateText.couldNotCheck(checkUpdateText.noRepository))]
        : [];
    case 'failed': {
      const text = checkUpdateText.couldNotCheck(found.reason);
      return found.by === 'user' ? [answer('warning', text)] : [{ kind: 'log', text }];
    }
    case 'release':
      return releaseAfter(found, current, context);
  }
}

function releaseAfter(
  found: Extract<CheckResult, { kind: 'release' }>,
  current: string,
  context: Context,
): readonly After[] {
  const version = versionOf(found.version);
  const running = versionOf(current);
  if (version === undefined || running === undefined || !isNewer(version, running)) {
    return found.by === 'user' ? [answer('success', checkUpdateText.latest(current))] : [];
  }
  const kept = context.state.runner.remembered[newerVersionKey];
  const told =
    typeof kept === 'object' &&
    kept !== null &&
    !Array.isArray(kept) &&
    (kept as Record<string, Json>)['version'] === found.version;
  if (told && found.by === 'start') {
    return [];
  }
  const download =
    found.page === undefined
      ? []
      : [
          {
            label: checkUpdateText.download,
            element: 'window.open-link@notification',
            feature: featureId('window.open-link'),
            target: appTarget,
            args: { address: found.page },
          },
        ];
  return [
    { kind: 'notify', level: 'info', text: checkUpdateText.available(found.version, current), actions: download },
    { kind: 'remember', key: newerVersionKey, value: { version: found.version, current, page: found.page ?? null } },
  ];
}

function answer(level: 'success' | 'warning', text: string): After {
  return { kind: 'notify', level, text };
}
