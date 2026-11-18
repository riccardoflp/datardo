/**
 * Feature: nav.pin
 *
 * Pins, unpins and reorders the collections, namespaces, keys, pages and saved queries used most, at the top of the
 * tree island, for each connection. Pins are Datardo's own data (`pins.json`): nothing is read from a deployment.
 */
import { refuse, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import type { Json } from '../../shared/engine-request';
import { connectionId, featureId } from '../../shared/ids';
import type { Pin } from '../../shared/state/nav';
import { text } from './text';
import { appPlan, appStep, findConnection, navInput, startArgs, type NavInput, type TabShows } from './types';

/** How many pins a connection can have (Datardo's choice). */
export const pinLimit = 50;

/** The pin of what a tab shows, when it can be pinned: a database, a document, a console, a playground cannot. */
export function pinOfTab(tab: TabShows): Pin | undefined {
  switch (tab.kind) {
    case 'collection':
      return {
        kind: 'collection',
        database: tab.database,
        collection: tab.collection,
        ...(tab.view === true ? { view: true } : {}),
      };
    case 'keys':
      return tab.namespace === undefined
        ? undefined
        : { kind: 'namespace', database: tab.database, namespace: tab.namespace };
    case 'key':
      return { kind: 'key', database: tab.database, keyHex: hexOfText(tab.key) };
    case 'page':
      return {
        kind: 'page',
        page: tab.page,
        title: tab.title,
        ...(tab.database === undefined ? {} : { database: tab.database }),
      };
    case 'app':
    case 'document':
    case 'playground':
    case 'console':
      return undefined;
  }
}

/** The hexadecimal of the UTF-8 bytes of a text, as a pinned key keeps its name. */
export function hexOfText(name: string): string {
  return [...new TextEncoder().encode(name)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The text of a key's name from the hexadecimal of its bytes; bytes that are not UTF-8 show as `\xNN`. */
export function textOfHex(hex: string): string {
  const bytes = new Uint8Array((hex.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // A name that is not UTF-8 is shown byte by byte, as value.format does for bytes; nothing is lost from the pin.
    return [...bytes].map((byte) => `\\x${byte.toString(16).padStart(2, '0')}`).join('');
  }
}

/** Whether two pins are the same thing. */
export function isSamePin(one: Pin, other: Pin): boolean {
  return pinKey(one) === pinKey(other);
}

function pinKey(pin: Pin): string {
  switch (pin.kind) {
    case 'collection':
      return `collection ${pin.database}.${pin.collection}`;
    case 'namespace':
      return `namespace ${String(pin.database)} ${pin.namespace}`;
    case 'key':
      return `key ${String(pin.database)} ${pin.keyHex}`;
    case 'page':
      return `page ${pin.database ?? ''} ${pin.page}`;
    case 'saved-query':
      return `saved-query ${pin.database}.${pin.collection} ${pin.name}`;
  }
}

/** How a step names a pin: `shop.orders`, `orders:2026: in db0`, `Monitor`. */
export function pinText(pin: Pin): string {
  switch (pin.kind) {
    case 'collection':
      return `${pin.database}.${pin.collection}`;
    case 'namespace':
      return `${pin.namespace} in db${String(pin.database)}`;
    case 'key':
      return `${textOfHex(pin.keyHex)} in db${String(pin.database)}`;
    case 'page':
      return pin.database === undefined ? pin.title : `${pin.database} / ${pin.title}`;
    case 'saved-query':
      return `${pin.name} of ${pin.database}.${pin.collection}`;
  }
}

/** A pin as the Pinned section shows it: its name, and the rest of its path, dimmed, when two have the same name. */
export interface PinLabel {
  readonly name: string;
  readonly rest?: string;
}

function nameAndRest(pin: Pin): { readonly name: string; readonly rest: string } {
  switch (pin.kind) {
    case 'collection':
      return { name: pin.collection, rest: pin.database };
    case 'namespace':
      return { name: pin.namespace, rest: `db${String(pin.database)}` };
    case 'key':
      return { name: textOfHex(pin.keyHex), rest: `db${String(pin.database)}` };
    case 'page':
      return { name: pin.title, rest: pin.database ?? '' };
    case 'saved-query':
      return { name: pin.name, rest: `${pin.database}.${pin.collection}` };
  }
}

/** The labels of the pins of a connection, in their order. */
export function pinLabels(pins: readonly Pin[]): readonly PinLabel[] {
  const parts = pins.map(nameAndRest);
  return parts.map(({ name, rest }) => {
    const twins = parts.filter((other) => other.name === name).length;
    return twins > 1 && rest !== '' ? { name, rest } : { name };
  });
}

/** The pins with one more at the end; the same when it is pinned already. */
export function withPin(pins: readonly Pin[], pin: Pin): readonly Pin[] {
  return pins.some((each) => isSamePin(each, pin)) ? pins : [...pins, pin];
}

/** The pins without one. */
export function withoutPin(pins: readonly Pin[], pin: Pin): readonly Pin[] {
  return pins.filter((each) => !isSamePin(each, pin));
}

/** The pins with one moved to a place, counted from 0; the same when the place is outside the list. */
export function withPinMoved(pins: readonly Pin[], pin: Pin, to: number): readonly Pin[] {
  const from = pins.findIndex((each) => isSamePin(each, pin));
  if (from < 0 || to < 0 || to >= pins.length || to === from) {
    return pins;
  }
  const rest = pins.filter((_each, index) => index !== from);
  return [...rest.slice(0, to), pins[from] as Pin, ...rest.slice(to)];
}

/** What a pin's arguments say: which pin, on which connection, and what to do with it. */
interface PinArgs {
  readonly action: 'pin' | 'unpin' | 'move';
  readonly connection: string;
  readonly pin: Pin;
  readonly to: number;
}

function pinArgs(answers: Answers): PinArgs | undefined {
  const args = startArgs(answers);
  const pin = args['pin'] as Pin | undefined;
  const connection = args['connection'];
  if (pin === undefined || typeof pin !== 'object' || typeof connection !== 'string') {
    return undefined;
  }
  const action = args['action'] === 'unpin' || args['action'] === 'move' ? args['action'] : 'pin';
  return { action, connection, pin, to: typeof args['to'] === 'number' ? args['to'] : 0 };
}

/** The plan for the nav input given. */
export function planFor(input: NavInput, answers: Answers): Outcome {
  const args = pinArgs(answers);
  if (args === undefined) {
    return run(appPlan('Pin', []));
  }
  const id = connectionId(args.connection);
  const name = findConnection(input.connections, id)?.name ?? args.connection;
  const pins = input.nav.pins[args.connection] ?? [];
  const what = pinText(args.pin);
  const changed = { connection: args.connection, pin: args.pin as unknown as Json };
  switch (args.action) {
    case 'pin':
      if (pins.some((each) => isSamePin(each, args.pin))) {
        return run(appPlan(`Pin ${what}`, []));
      }
      if (pins.length >= pinLimit) {
        return refuse('nav.pin/too-many', text.pin.tooMany(name, pinLimit));
      }
      return run(appPlan(`Pin ${what}`, [appStep(`pin ${what} on ${name}`, 'nav.add-pin', changed)]));
    case 'unpin':
      return run(appPlan(`Unpin ${what}`, [appStep(`unpin ${what} on ${name}`, 'nav.remove-pin', changed)]));
    case 'move': {
      if (withPinMoved(pins, args.pin, args.to) === pins) {
        return run(appPlan(`Move ${what}`, []));
      }
      const words = `move ${what} to place ${String(args.to + 1)} of the pins of ${name}`;
      return run(appPlan(`Move ${what}`, [appStep(words, 'nav.move-pin', { ...changed, to: args.to })]));
    }
  }
}

/**
 * Pins, unpins or moves a pin: `args` is `{ action: 'pin' | 'unpin' | 'move', connection, pin, to? }`, `to` the place
 * counted from 0.
 */
export function plan(context: Context, answers: Answers): Outcome {
  return planFor(navInput(context.state), answers);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('nav.pin'), plan };
