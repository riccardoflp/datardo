/**
 * Feature: console.output
 *
 * The list of what was run in a console since it was opened or cleared, the oldest at the top: each command at the
 * prompt it was typed at, with its secret arguments `***`, the time it was sent and the time its reply took; then its
 * reply as the lines of `console.reply`, its refusal or its notes. Each item has a context menu. The output keeps the
 * last 500 commands, shows the first 1,000 elements of an array and the first 10,000 characters of a line, and follows
 * the newest reply unless the user scrolled up.
 */
import { groupThousands } from '../../shared/text-units';
import { replyLines, type ReplyLine } from './reply';
import { commandArguments } from './parse-line';
import { holdsSecret } from './secret-arguments';
import { text } from './text';
import type { ConsoleState, OutputEntry, Reply } from './types';

/** The output keeps the last 500 commands with their replies (Datardo's choice). */
export const outputKeeps = 500;

/** An array, a map or a set shows its first 1,000 elements, then **Show 1,000 more** (Datardo's choice). */
export const elementsShown = 1000;

/** A line longer than 10,000 characters shows its first 10,000, then `…` and **Show all** (Datardo's choice). */
export const charactersShown = 10_000;

/** A reply is kept up to 16 MB (Datardo's choice). */
export const replyKeptBytes = 16 * 1024 * 1024;

/** The output once an entry is added: the oldest dropped from the top beyond 500. */
export function entriesAfter(entries: readonly OutputEntry[], entry: OutputEntry): readonly OutputEntry[] {
  const after = [...entries, entry];
  return after.length > outputKeeps ? after.slice(after.length - outputKeeps) : after;
}

/** How long a reply took: `0.4 ms`, `12 ms`, `1.24 s`, `12.4 s`. */
export function durationText(milliseconds: number): string {
  if (milliseconds < 1) {
    return `${milliseconds.toFixed(1)} ms`;
  }
  if (milliseconds < 1000) {
    return `${String(Math.round(milliseconds))} ms`;
  }
  const seconds = milliseconds / 1000;
  return `${seconds < 10 ? seconds.toFixed(2) : seconds.toFixed(1)} s`;
}

/** The time of day a command was sent, `14:05:09`, in the time zone `offsetMinutes` east of UTC. */
export function clockText(milliseconds: number, offsetMinutes: number): string {
  const secondsOfDay = Math.floor((milliseconds + offsetMinutes * 60_000) / 1000) % 86_400;
  const day = secondsOfDay < 0 ? secondsOfDay + 86_400 : secondsOfDay;
  return [Math.floor(day / 3600), Math.floor((day % 3600) / 60), day % 60]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

/** A size in bytes as the output says it: `9 bytes`, `1.0 MB`. */
export function sizeText(bytes: number): string {
  const units = ['KB', 'MB', 'GB'];
  if (bytes < 1024) {
    return `${groupThousands(bytes)} ${bytes === 1 ? 'byte' : 'bytes'}`;
  }
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(1)} ${units[unit] ?? 'GB'}`;
}

/** The note of a reply cut at 16 MB: *Cut at 16 MB of 512.0 MB.* */
export function cutNote(totalBytes: number): string {
  return text.output.cutAt('16 MB', sizeText(totalBytes));
}

/** An entry of a context menu: the feature it starts, where, and with what. */
export interface MenuEntry {
  readonly label: string;
  readonly feature: string;
  readonly element: string;
  readonly args: Readonly<Record<string, string | number>>;
}

/** One command of the output with what came of it. */
export interface OutputItem {
  readonly id: number;
  readonly prompt: string;
  readonly line: string;
  readonly sentAt: string;
  readonly took?: string;
  /** The reply's lines as drawn; a line longer than 10,000 characters is cut, with `…` at its end. */
  readonly lines: readonly ReplyLine[];
  /** **Show 1,000 more** and *1,000 of 12,500*, when the reply has more elements than shown. */
  readonly more?: { readonly label: string; readonly shownOf: string };
  /** **Show all** and the size of the longest string cut. */
  readonly showAll?: { readonly label: string; readonly size: string };
  readonly refusal?: {
    readonly message: string;
    readonly openPubSub?: { readonly label: string; readonly feature: string };
  };
  readonly notes: readonly string[];
  readonly menu: readonly MenuEntry[];
}

/** What the output shows. */
export interface OutputView {
  readonly label: string;
  /** *Type a Redis command and press Enter. …*, with nothing run. */
  readonly empty?: string;
  readonly items: readonly OutputItem[];
  /** **Newest**, while the user has scrolled up. */
  readonly newest?: string;
}

/** What the output is drawn from: the console, the time zone, and what the user asked to see more of. */
export interface OutputInput {
  readonly console: ConsoleState;
  readonly offsetMinutes: number;
  /** By entry: how many elements are shown, when **Show 1,000 more** was pressed. */
  readonly shown: Readonly<Record<number, number>>;
  /** The entries whose **Show all** was pressed. */
  readonly whole: readonly number[];
  readonly scrolledUp: boolean;
}

function elementCount(reply: Reply): number {
  if (reply.kind === 'array' || reply.kind === 'set' || reply.kind === 'push') {
    return reply.items.length;
  }
  return reply.kind === 'map' ? reply.entries.length : 0;
}

/** The reply with its first `count` elements. */
function firstElements(reply: Reply, count: number): Reply {
  if (reply.kind === 'array' || reply.kind === 'set' || reply.kind === 'push') {
    return { ...reply, items: reply.items.slice(0, count) };
  }
  return reply.kind === 'map' ? { ...reply, entries: reply.entries.slice(0, count) } : reply;
}

function cutLines(lines: readonly ReplyLine[]): { readonly lines: readonly ReplyLine[]; readonly longest?: number } {
  let longest: number | undefined;
  const cut = lines.map((line) => {
    if (line.text.length <= charactersShown) {
      return line;
    }
    const size = Math.max(0, ...line.strings.map((each) => each.length));
    longest = Math.max(longest ?? 0, size);
    return { ...line, text: `${line.text.slice(0, charactersShown)}…` };
  });
  return longest === undefined ? { lines: cut } : { lines: cut, longest };
}

function menuOf(entry: OutputEntry): readonly MenuEntry[] {
  const copy = (label: string, variant: string): MenuEntry => ({
    label,
    feature: 'console.copy-reply',
    element: 'console.copy-reply@item-menu',
    args: { variant, entry: entry.id },
  });
  const read = commandArguments(entry.line);
  const again: readonly MenuEntry[] =
    read.kind === 'arguments' && !holdsSecret(read.arguments)
      ? [
          {
            label: text.output.runAgain,
            feature: 'console.run',
            element: 'console.run@item-menu',
            args: { line: entry.line },
          },
        ]
      : [];
  return [copy(text.output.copyReply, 'reply'), copy(text.output.copyCommand, 'command'), ...again];
}

/** **Copy value**, offered when the menu was opened on a string of a reply: the line and the string of that line. */
export function copyValueEntry(entry: number, line: number, string: number): MenuEntry {
  return {
    label: text.output.copyValue,
    feature: 'console.copy-reply',
    element: 'console.copy-reply@item-menu',
    args: { variant: 'value', entry, line, string },
  };
}

function replyPart(entry: OutputEntry, input: OutputInput): Pick<OutputItem, 'lines' | 'more' | 'showAll'> {
  if (entry.reply === undefined) {
    return { lines: [] };
  }
  const total = elementCount(entry.reply);
  const shown = Math.min(total, input.shown[entry.id] ?? elementsShown);
  const command = commandArguments(entry.line);
  const words = command.kind === 'arguments' ? command.arguments : [];
  const all = replyLines(firstElements(entry.reply, shown), words, entry.protocol);
  const cut = input.whole.includes(entry.id) ? { lines: all } : cutLines(all);
  return {
    lines: cut.lines,
    ...(shown < total
      ? {
          more: {
            label: text.output.showMore(Math.min(elementsShown, total - shown)),
            shownOf: text.output.shownOf(shown, total),
          },
        }
      : {}),
    ...(cut.longest === undefined ? {} : { showAll: { label: text.output.showAll, size: sizeText(cut.longest) } }),
  };
}

function itemOf(entry: OutputEntry, input: OutputInput): OutputItem {
  const refusal = entry.refusal;
  return {
    id: entry.id,
    prompt: entry.prompt,
    line: entry.line,
    sentAt: clockText(entry.sentAt, input.offsetMinutes),
    ...(entry.tookMs === undefined ? {} : { took: durationText(entry.tookMs) }),
    ...replyPart(entry, input),
    ...(refusal === undefined
      ? {}
      : {
          refusal: {
            message: refusal.message,
            ...(refusal.offersPubSub
              ? { openPubSub: { label: text.classify.openPubSub, feature: 'pubsub.show' } }
              : {}),
          },
        }),
    notes: entry.notes,
    menu: menuOf(entry),
  };
}

/** Feature: console.output — what the output shows. */
export function view(input: OutputInput): OutputView {
  const items = input.console.entries.map((entry) => itemOf(entry, input));
  return {
    label: text.output.label,
    ...(items.length === 0 ? { empty: text.show.empty } : {}),
    items,
    ...(input.scrolledUp ? { newest: text.output.newest } : {}),
  };
}
