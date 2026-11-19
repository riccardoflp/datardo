/**
 * The reads of a keys tab, started through the bridge as Read features the runner carries out: the calls of a scan one
 * after the other until its run ends (`key.scan`, `key.scan:types`), **Scan more**, a new pattern or type, a refresh
 * (`key.refresh` asks it), the expiry and the size of the rows on screen (`key.details`) and the key the inspector
 * island shows (`key.inspect:read`). The window keeps what they give; a newer run stops an older one.
 */
import { detailsArgs, type DetailsRead } from '../../../features/key/details';
import { type InspectedKey } from '../../../features/key/inspect';
import { pattern } from '../../../features/key/pattern';
import { afterPage, scanMore as scanMoreOf, scanStart, typesArgs, type ScanPage } from '../../../features/key/scan';
import { selectionAfter, noSelection } from '../../../features/key/select';
import { scanArgsOf, type ReadDetails } from '../../../features/key/show';
import { bytesOfHex, hexOf, typeFilterOf, type KeyName, type KeyType } from '../../../features/key/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { featureId } from '../../../shared/ids';
import { changeTab, keysTabOf, type KeysTab } from './keys-store';
import { pageStateOf } from './keys-state';

async function read(state: KeysTab, feature: string, args: Json): Promise<IntentResult> {
  return window.datardo.start({
    feature: featureId(feature),
    target: { kind: 'redis-database', connection: state.where.connection, database: state.where.database },
    place: 'toolbar',
    args,
  });
}

function messageOf(result: IntentResult): string | undefined {
  return result.kind === 'failed' || result.kind === 'refused' ? result.message : undefined;
}

async function typesOf(state: KeysTab, page: ScanPage): Promise<readonly KeyType[]> {
  if (state.last.type !== 'all') {
    return page.keys.map(() => state.last.type);
  }
  if (page.keys.length === 0) {
    return [];
  }
  const result = await read(
    state,
    'key.scan:types',
    typesArgs(state.where.connection, state.where.database, page.keys),
  );
  return result.kind === 'read' ? (result.result as readonly KeyType[]) : [];
}

/** Makes the calls of a run one after the other, until it ends, it is stopped or a newer run starts. */
async function continueScan(tab: string, run: number): Promise<void> {
  for (;;) {
    const state = keysTabOf(tab);
    if (state?.run !== run || !state.scanning) {
      return;
    }
    const cursor = state.scan?.cursor ?? '0';
    const result = await read(state, 'key.scan', scanArgsOf(pageStateOf(state), cursor));
    const page = result.kind === 'read' ? (result.result as ScanPage) : undefined;
    const types = page === undefined ? [] : await typesOf(state, page);
    if (keysTabOf(tab)?.run !== run) {
      return;
    }
    if (page === undefined) {
      const error = messageOf(result);
      const unsupported = result.kind === 'refused' && result.code === 'key.scan/unsupported';
      changeTab(tab, (now) => ({
        ...now,
        scanning: false,
        ...(error === undefined || unsupported ? {} : { error }),
        ...(unsupported ? { last: { ...now.last, type: 'all' as const } } : {}),
      }));
      return;
    }
    const scan = afterPage(state.scan ?? scanStart, page, types);
    changeTab(tab, (now) => ({ ...now, scan, scanning: scan.ended === undefined }));
    if (scan.ended !== undefined) {
      return;
    }
  }
}

/** Starts a scan from cursor 0 with what the tab asks now: the rows, the details and the selection are dropped. */
export function scanAgain(tab: string, change: (state: KeysTab) => KeysTab = (state) => state): void {
  let run = 0;
  changeTab(tab, (before) => {
    const asked = change(before);
    run = before.run + 1;
    const { scan: _scan, error: _error, inspected: _inspected, ...rest } = asked;
    return { ...rest, run, scanning: true, details: new Map(), selection: noSelection };
  });
  void continueScan(tab, run);
}

/** `Enter` in the pattern field: what is typed becomes the pattern (`key.pattern`), and a new scan starts. */
export function scanTyped(tab: string): void {
  scanAgain(tab, (state) => ({
    ...state,
    last: { typed: state.field, pattern: pattern({ kind: 'typed', text: state.field }), type: state.last.type },
  }));
}

/** The type filter changes: a new scan from cursor 0 with `TYPE <type>`. */
export function scanType(tab: string, type: string): void {
  scanAgain(tab, (state) => ({ ...state, last: { ...state.last, type: typeFilterOf(type) } }));
}

/** **Scan more**: another run from the cursor the last stopped at; the rows and the selection are kept. */
export function scanMore(tab: string): void {
  let run = 0;
  changeTab(tab, (state) => {
    run = state.run + 1;
    return state.scan === undefined ? state : { ...state, run, scanning: true, scan: scanMoreOf(state.scan) };
  });
  void continueScan(tab, run);
}

/** **Cancel**: the run stops after the call in flight; the keys found and the cursor are kept. */
export function stopScan(tab: string): void {
  changeTab(tab, (state) => ({
    ...state,
    run: state.run + 1,
    scanning: false,
    ...(state.scan === undefined ? {} : { scan: { ...state.scan, ended: state.scan.ended ?? 'stopped' } }),
  }));
}

/** What `key.details` read, as the tab keeps it: the date of expiry from the time of the read. */
function keptDetails(result: DetailsRead, readAt: number): ReadonlyMap<string, ReadDetails> {
  return new Map(
    result.keys.map((key) => [
      hexOf(key.name),
      key.gone
        ? { expiresAt: null, gone: true }
        : {
            expiresAt: key.timeLeft === undefined || key.timeLeft === null ? null : readAt + key.timeLeft,
            ...(key.size === undefined ? {} : { size: key.size }),
          },
    ]),
  );
}

/** Reads the expiry and the size of keys not read yet, in one pipeline; a row found gone leaves the selection. */
export async function readDetails(tab: string, names: readonly KeyName[]): Promise<void> {
  const state = keysTabOf(tab);
  if (state === undefined || names.length === 0) {
    return;
  }
  const sizes = state.sizesRefused ? 'skip' : 'read';
  const args = detailsArgs(state.where.connection, state.where.database, names, sizes);
  const result = await read(state, 'key.details', args);
  if (result.kind !== 'read') {
    return;
  }
  const details = result.result as DetailsRead;
  const kept = keptDetails(details, Date.now());
  changeTab(tab, (now) => {
    let selection = now.selection;
    for (const key of details.keys.filter((each) => each.gone)) {
      selection = selectionAfter(selection, { kind: 'gone', key: key.name }, []);
    }
    return {
      ...now,
      details: new Map([...now.details, ...kept]),
      sizesRefused: now.sizesRefused || details.sizes === 'refused',
      selection,
    };
  });
}

/** Reads what the inspector island shows of the one key selected: `TYPE`, `PTTL`, `MEMORY USAGE`, `OBJECT ENCODING`. */
export async function readInspected(tab: string, keyHex: string): Promise<void> {
  const state = keysTabOf(tab);
  const name = bytesOfHex(keyHex);
  if (state === undefined || name === undefined) {
    return;
  }
  changeTab(tab, (now) => ({ ...now, inspected: { key: keyHex, read: { kind: 'loading' } } }));
  const result = await read(state, 'key.inspect:read', {
    connection: state.where.connection,
    database: state.where.database,
    key: keyHex,
  });
  const readAt = Date.now();
  changeTab(tab, (now) => {
    if (now.inspected?.key !== keyHex) {
      return now;
    }
    const key = result.kind === 'read' ? (result.result as InspectedKey | 'gone') : undefined;
    const inspected =
      key === undefined
        ? { kind: 'failed' as const, error: messageOf(result) ?? '' }
        : key === 'gone'
          ? { kind: 'gone' as const }
          : { kind: 'loaded' as const, key, readAt };
    return { ...now, inspected: { key: keyHex, read: inspected } };
  });
}
