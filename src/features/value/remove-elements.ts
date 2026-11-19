/**
 * Feature: value.remove-elements — removes the element at one index of a list, or at the selected indexes, and no
 * other, also when the list holds equal elements. Redis removes from a list by value (`LREM`), not by index: so each
 * element is first replaced, at its index, by a marker no list holds, and `LREM` then removes the marker, inside
 * `MULTI` and `EXEC` so that no other client ever sees it.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { refuse } from '../../shared/feature';
import { currentReplies, guard, readCurrent, writePlan } from './check';
import { indexAnswer } from './edit-element';
import { shown } from './format';
import { checkText, counted, listText, removalText } from './text';
import { bytesOf, fieldsOf, hexOf, isSameBytes, replyBytes, replyNumber, utf8, writeStep, type KeyAt } from './types';

/** What every marker starts with. */
export const markerPrefix = '__datardo_removed__:';

/** An element to remove: its index and its bytes as shown. */
export interface ShownElement {
  readonly index: number;
  readonly element: Uint8Array;
}

/** The elements of an answer: `[{ index, element }]`, the element as bytes or `{ hex }`. */
export function elementsOf(value: unknown): readonly ShownElement[] {
  return Array.isArray(value)
    ? (value as readonly unknown[]).map((each) => {
        const fields = fieldsOf(each);
        return { index: indexAnswer(fields['index']), element: bytesOf(fields['element']) ?? new Uint8Array() };
      })
    : [];
}

/** 32 hexadecimal digits from a text, by FNV-1a with four seeds: a stand-in when the runner drew none. */
function digitsOf(text: string): string {
  return [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
    .map((seed) => {
      let hash = seed >>> 0;
      for (const byte of utf8(text)) {
        hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
      }
      return hash.toString(16).padStart(8, '0');
    })
    .join('');
}

/** The marker of this plan: `__datardo_removed__:` and the 32 hexadecimal digits the runner drew (`answers.marker`). */
export function markerOf(answers: Answers, context: Context, at: KeyAt): string {
  const drawn = answers['marker'];
  const digits =
    typeof drawn === 'string' && /^[0-9a-f]{32}$/u.test(drawn)
      ? drawn
      : digitsOf(`${String(context.now)}:${hexOf(at.key)}`);
  return `${markerPrefix}${digits}`;
}

/** The confirmation's detail: the element in its compact form for one, and the note when they are all the elements. */
function detailOf(elements: readonly ShownElement[], all: boolean, name: string): string {
  const [first] = elements;
  const element = elements.length === 1 && first !== undefined ? [shown(first.element, undefined, 'compact').text] : [];
  return [...element, ...(all ? [checkText.allItems(name, 'elements')] : [])].join('\n');
}

/**
 * Feature: value.remove-elements — `answers.elements` are the rows, `{ index, element }`. Then `TYPE`, `LINDEX` of each
 * index and `LLEN`, and the plan `MULTI`, `LSET <key> <index> <marker>` for each, `LREM <key> <n> <marker>`, `EXEC`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const guarded = guard(context, answers, 'list', {
    readOnly: 'value.remove-elements/read-only',
    gone: 'value.remove-elements/gone',
    typeChanged: 'value.remove-elements/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  const elements = elementsOf(answers['elements']);
  const current = currentReplies(answers);
  if (current === undefined) {
    return readCurrent([...elements.map((each) => ['LINDEX', at.key, String(each.index)]), ['LLEN', at.key]]);
  }
  const moved = elements.find((each, place) => {
    const now = replyBytes(current[place]);
    return now === undefined || !isSameBytes(now, each.element);
  });
  if (moved !== undefined) {
    return refuse('value.remove-elements/changed', listText.changed(moved.index, name));
  }
  const count = replyNumber(current[elements.length]) ?? 0;
  const all = elements.length >= count;
  const marker = markerOf(answers, context, at);
  const [first] = elements;
  const single = elements.length === 1 && first !== undefined;
  const many = counted(elements.length, 'element', 'elements');
  return writePlan({
    at,
    name: single ? listText.titleOne(first.index, name) : removalText.titleMany(many, name),
    steps: [
      writeStep(at, ['MULTI']),
      ...elements.map((each) => writeStep(at, ['LSET', at.key, String(each.index), marker])),
      writeStep(at, ['LREM', at.key, String(elements.length), marker]),
      writeStep(at, ['EXEC']),
    ],
    done: all
      ? checkText.noneLeft(name, 'elements')
      : single
        ? listText.removedOne(first.index, name)
        : removalText.removedMany(many, name),
    confirm: {
      question: single ? listText.removeOne(first.index, name) : removalText.removeMany(many, name),
      detail: detailOf(elements, all, name),
      button: removalText.removeButton,
    },
  });
}
