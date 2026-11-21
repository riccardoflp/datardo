/**
 * What `advisor.show` shows of each advice, in its list: the collection, the index, why, its queries, and the
 * buttons that act on it (`index.create`, `index.hide`, `index.drop`, and **Open** and **Explain**, which open the
 * slowest operation of a shape with `monitor.open-slow-query`).
 */
import type { Json } from '../../../shared/engine-request';
import type { ConnectionId } from '../../../shared/ids';
import type { Target } from '../../../shared/target';
import { groupThousands } from '../../../shared/text-units';
import { sizeText } from '../../connection/overview';
import { dateTimeText } from '../../monitor/parts/units';
import { indexKeyDocument, indexKeyText } from '../../monitor/types';
import { text } from '../text';
import type { AdvisorQuery, CreateAdvice, RedundantAdvice, Scope, UnusedAdvice } from '../types';
import { agoText, durationText, indexLabel, indexMarks, startControl, type AdvisorControl } from './words';

/** The queries an advice shows until **+2 more queries** is clicked. */
export const queriesShown = 3;

/** What the items are drawn for. */
export interface ItemsInput {
  readonly connection: ConnectionId;
  readonly readOnly: boolean;
  readonly scope: Scope;
  readonly now: number;
  /** The advices whose queries are all shown. */
  readonly expanded: readonly string[];
}

/** A query of an advice to create, as one line with its buttons. */
export interface QueryItem {
  readonly kind: string;
  readonly shape: string;
  readonly details: string;
  readonly open: AdvisorControl;
  readonly explain: AdvisorControl;
}

/** An index to create. */
export interface CreateItem {
  readonly id: string;
  readonly collection: string;
  readonly keys: string;
  readonly why: string;
  readonly queries: readonly QueryItem[];
  /** **+2 more queries** or **Fewer queries**, when there are more than 3. */
  readonly more?: AdvisorControl;
  readonly create: AdvisorControl;
  readonly copy: AdvisorControl;
}

/** A redundant, unused or hidden index. */
export interface IndexItem {
  readonly id: string;
  readonly collection: string;
  /** Its name and keys: `status_1 { status: 1 }`. */
  readonly index: string;
  /** `unique · sparse · partial · collation fr · hidden`, those that apply. */
  readonly marks: string;
  readonly size?: string;
  readonly lines: readonly string[];
  readonly buttons: readonly AdvisorControl[];
}

function collectionText(input: ItemsInput, advice: { readonly database: string; readonly collection: string }): string {
  return input.scope.kind === 'connection' ? `${advice.database}.${advice.collection}` : advice.collection;
}

function collectionTarget(
  input: ItemsInput,
  advice: { readonly database: string; readonly collection: string },
): Target {
  return { kind: 'collection', connection: input.connection, database: advice.database, collection: advice.collection };
}

function on(
  input: ItemsInput,
  advice: { readonly database: string; readonly collection: string },
): Record<string, Json> {
  return { connection: input.connection, database: advice.database, collection: advice.collection };
}

/** Why an index is to be created: the reason of its queries, then what it serves. */
function whyText(advice: CreateAdvice): string {
  const reason = advice.queries.some((query) => query.collectionScan)
    ? text.create.collectionScan
    : advice.queries.some((query) => query.inMemorySort)
      ? text.create.inMemorySort
      : text.create.examinedMany;
  const serves = advice.queries.length > 1 ? text.create.servesAll(advice.queries.length) : text.create.serves;
  return `${text.create.why(advice.operations, durationText(advice.totalMillis), reason)} ${serves}`;
}

/** `7 times · avg 350 ms · 12,000 examined / 20 returned · collection scan`, per operation. */
export function queryDetails(query: AdvisorQuery): string {
  const examined = groupThousands(Math.round(query.docsExamined / query.operations));
  const returned = groupThousands(Math.round(query.returned / query.operations));
  const marks = [
    query.collectionScan ? text.create.collectionScanMark : '',
    query.inMemorySort ? text.create.inMemorySortMark : '',
  ].filter((mark) => mark !== '');
  const line = text.create.query(query.operations, durationText(query.averageMillis), examined, returned);
  return marks.length === 0 ? line : `${line} · ${marks.join(', ')}`;
}

function queryItem(input: ItemsInput, advice: CreateAdvice, query: AdvisorQuery): QueryItem {
  const opening = (explain: boolean): Json => ({
    ...on(input, advice),
    namespace: `${advice.database}.${advice.collection}`,
    kind: query.kind,
    query: query.example.query as Json,
    explain,
  });
  const target = collectionTarget(input, advice);
  return {
    kind: query.kind,
    shape: query.shape,
    details: queryDetails(query),
    open: startControl({
      label: text.create.open,
      feature: 'monitor.open-slow-query',
      target,
      args: opening(false),
      tooltip: text.create.openTooltip,
    }),
    explain: startControl({
      label: text.create.explain,
      feature: 'monitor.open-slow-query',
      target,
      args: opening(true),
      tooltip: text.create.explainTooltip,
    }),
  };
}

/** The mongosh command **Copy** copies: `db.getSiblingDB("shop").getCollection("orders").createIndex({ … })`. */
export function createCommand(advice: CreateAdvice): string {
  return `db.getSiblingDB(${JSON.stringify(advice.database)}).getCollection(${JSON.stringify(advice.collection)}).createIndex(${indexKeyText(advice.keys)})`;
}

/** An index to create, as its list shows it. */
export function createItem(input: ItemsInput, advice: CreateAdvice): CreateItem {
  const expanded = input.expanded.includes(advice.id);
  const shown = expanded ? advice.queries : advice.queries.slice(0, queriesShown);
  const hidden = advice.queries.length - queriesShown;
  const keys = indexKeyText(advice.keys);
  const namespace = `${advice.database}.${advice.collection}`;
  return {
    id: advice.id,
    collection: collectionText(input, advice),
    keys,
    why: whyText(advice),
    queries: shown.map((query) => queryItem(input, advice, query)),
    ...(hidden > 0
      ? { more: { kind: 'toggle', label: expanded ? text.create.fewer : text.create.more(hidden), advice: advice.id } }
      : {}),
    create: startControl({
      label: text.create.createIndex,
      feature: 'index.create',
      target: collectionTarget(input, advice),
      args: { ...on(input, advice), keys: indexKeyDocument(advice.keys) },
      tooltip: text.create.createTooltip(keys, namespace),
      readOnly: input.readOnly,
    }),
    copy: { kind: 'copy', label: text.create.copy, tooltip: text.create.copyTooltip, text: createCommand(advice) },
  };
}

function indexButtons(input: ItemsInput, advice: RedundantAdvice | UnusedAdvice, reason: string): AdvisorControl[] {
  const target = collectionTarget(input, advice);
  // `index.hide` and `index.drop` take the index as `index`, and the reason of the advice as `advice`, which begins
  // the confirmation of the drop and makes the hide say what it did.
  const args = { ...on(input, advice), index: advice.index.name, advice: reason };
  const hidden = advice.index.hidden;
  return [
    startControl({
      label: hidden ? text.buttons.unhide : text.buttons.hide,
      feature: 'index.hide',
      target,
      args: { ...args, hidden: !hidden },
      tooltip: hidden ? text.buttons.unhideTooltip : text.buttons.hideTooltip,
      readOnly: input.readOnly,
    }),
    startControl({
      label: text.buttons.drop,
      feature: 'index.drop',
      target,
      args,
      readOnly: input.readOnly,
    }),
  ];
}

function indexItem(input: ItemsInput, advice: RedundantAdvice | UnusedAdvice, lines: readonly string[]): IndexItem {
  const size = advice.index.size;
  return {
    id: advice.id,
    collection: collectionText(input, advice),
    index: indexLabel(advice.index),
    marks: indexMarks(advice.index),
    ...(size === undefined ? {} : { size: sizeText(size) }),
    lines,
    buttons: [],
  };
}

/** A redundant index, as its list shows it. */
export function redundantItem(input: ItemsInput, advice: RedundantAdvice): IndexItem {
  const by = indexLabel(advice.by);
  const { uses, since } = advice.index;
  const used = uses === undefined || since === undefined ? [] : [text.redundant.used(uses, agoText(input.now - since))];
  const item = indexItem(input, advice, [text.redundant.why(by), ...used]);
  return { ...item, buttons: indexButtons(input, advice, text.redundant.dropReason(by)) };
}

/** An unused or a hidden index, as its list shows it. */
export function unusedItem(input: ItemsInput, advice: UnusedAdvice): IndexItem {
  if (advice.kind === 'hidden') {
    const item = indexItem(input, advice, [text.unused.hidden]);
    return { ...item, buttons: indexButtons(input, advice, text.unused.hiddenDropReason) };
  }
  const since = advice.index.since;
  const ago = since === undefined ? undefined : agoText(input.now - since);
  const line =
    since === undefined || ago === undefined ? text.unused.sinceStart : text.unused.since(ago, dateTimeText(since));
  const item = indexItem(input, advice, [line]);
  return {
    ...item,
    buttons: indexButtons(input, advice, ago === undefined ? text.unused.sinceStart : text.unused.dropReason(ago)),
  };
}
