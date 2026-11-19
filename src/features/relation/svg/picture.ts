/**
 * The diagram as an SVG file that needs nothing else: no script, no style sheet, no font file; UTF-8 with the XML
 * declaration; always the light colors on a white background; every box where it is on the page, with a margin of 20;
 * the zoom and the selection do not count. Ported from Mongoster's `toSvg`.
 */
import { relationText } from '../detect';
import { relationCurve } from '../model/geometry';
import { firstType, headHeight, isEmptyBox, rowHeight, rowLabel, rowMark, shownFields } from '../model/rows';
import { text } from '../text';
import type { Box, ReferenceGraph, SampledCollection } from '../types';

/** The margin around the drawing. */
export const margin = 20;
/** Room on the right for the loop of a collection that refers to itself. */
const loopRoom = 60;

const colors = {
  background: '#ffffff',
  arrow: '#5a6b7d',
  border: '#9aa7b4',
  head: '#e6eef7',
  viewHead: '#efe7f7',
  name: '#1f2d3d',
  muted: '#6b7785',
  key: '#0b5cad',
} as const;

function escaped(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function number(value: number): string {
  return String(Math.round(value * 100) / 100);
}

interface Drawn {
  readonly graph: ReferenceGraph;
  readonly keysOnly: boolean;
}

function rowLines(box: Box, collection: SampledCollection, drawn: Drawn): readonly string[] {
  const { rows, more } = shownFields(collection, drawn.graph.relations, drawn.keysOnly);
  const lineY = (at: number): string => number(box.top + headHeight + at * rowHeight + rowHeight / 2 + 6);
  const lines = rows.flatMap((field, at) => {
    const mark = rowMark(collection, drawn.graph.relations, field);
    const label = rowLabel(field, rows);
    const right = [mark, firstType(field)].filter((part) => part !== undefined).join(' · ');
    return [
      `<text x="${number(box.left + 10 + label.indent * 10)}" y="${lineY(at)}" fill="${mark === undefined ? colors.name : colors.key}" font-family="Consolas, Menlo, monospace" font-size="11.5">${escaped(label.text)}</text>`,
      `<text x="${number(box.left + box.width - 10)}" y="${lineY(at)}" text-anchor="end" fill="${colors.muted}" font-size="11">${escaped(right)}</text>`,
    ];
  });
  const last = more > 0 ? text.diagram.moreFields(more) : isEmptyBox(collection) ? text.diagram.emptyBox : undefined;
  return last === undefined
    ? lines
    : [
        ...lines,
        `<text x="${number(box.left + 10)}" y="${lineY(rows.length)}" fill="${colors.muted}" font-size="11">${escaped(last)}</text>`,
      ];
}

function boxLines(box: Box, collection: SampledCollection, drawn: Drawn): readonly string[] {
  const name = `${collection.name}${collection.view ? text.svg.viewSuffix : ''}`;
  const head = [
    `<g><rect x="${number(box.left)}" y="${number(box.top)}" width="${number(box.width)}" height="${number(box.height)}" rx="4" fill="${colors.background}" stroke="${colors.border}"/>`,
    `<rect x="${number(box.left)}" y="${number(box.top)}" width="${number(box.width)}" height="${String(headHeight)}" rx="4" fill="${collection.view ? colors.viewHead : colors.head}"/>`,
    `<text x="${number(box.left + 10)}" y="${number(box.top + 19)}" font-weight="600" fill="${colors.name}">${escaped(name)}</text>`,
  ];
  const documents =
    collection.documents === undefined
      ? []
      : [
          `<text x="${number(box.left + box.width - 10)}" y="${number(box.top + 19)}" text-anchor="end" fill="${colors.muted}" font-size="11">${escaped(text.diagram.documents(collection.documents))}</text>`,
        ];
  return [...head, ...documents, ...rowLines(box, collection, drawn), '</g>'];
}

function arrowLines(boxes: readonly Box[], drawn: Drawn): readonly string[] {
  const placed = { boxes, collections: drawn.graph.collections };
  return drawn.graph.relations.flatMap((relation) => {
    const drawnCurve = relationCurve(relation, placed, { relations: drawn.graph.relations, keysOnly: drawn.keysOnly });
    if (drawnCurve === undefined) {
      return [];
    }
    const dashes = relation.kind === 'view' ? ' stroke-dasharray="5 4"' : '';
    return [
      `<path d="${drawnCurve.d}" fill="none" stroke="${colors.arrow}" stroke-width="1.4"${dashes} marker-end="url(#arrow)"><title>${escaped(relationText(relation))}</title></path>`,
    ];
  });
}

/** The SVG text of the diagram with its boxes where they are, ending with a new line. */
export function diagramSvg(graph: ReferenceGraph, boxes: readonly Box[], keysOnly: boolean): string {
  const drawn: Drawn = { graph, keysOnly };
  const left = Math.min(0, ...boxes.map((box) => box.left)) - margin;
  const top = Math.min(0, ...boxes.map((box) => box.top)) - margin;
  const width = Math.ceil(Math.max(0, ...boxes.map((box) => box.left + box.width)) - left + margin + loopRoom);
  const height = Math.ceil(Math.max(0, ...boxes.map((box) => box.top + box.height)) - top + margin);
  const area = `${number(left)} ${number(top)} ${String(width)} ${String(height)}`;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="${area}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="12">`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${colors.arrow}"/></marker></defs>`,
    `<rect x="${number(left)}" y="${number(top)}" width="${String(width)}" height="${String(height)}" fill="${colors.background}"/>`,
    ...arrowLines(boxes, drawn),
    ...boxes.flatMap((box) => {
      const collection = graph.collections.find((each) => each.name === box.name);
      return collection === undefined ? [] : boxLines(box, collection, drawn);
    }),
    '</svg>',
  ];
  return `${lines.join('\n')}\n`;
}
