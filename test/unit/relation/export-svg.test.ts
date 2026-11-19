import { describe, expect, it } from 'vitest';
import {
  dialogArgs,
  fileRead,
  fileReadId,
  openFileAction,
  plan,
  svgWriter,
} from '../../../src/features/relation/export-svg';
import { layout } from '../../../src/features/relation/layout';
import { diagramSvg } from '../../../src/features/relation/svg/picture';
import type { Box, ReferenceGraph } from '../../../src/features/relation/types';
import type { Answers, FileStep } from '../../../src/shared/feature';
import { contextOn, local, planOf, relation, shopGraph, view, withFields } from './context';

const path = 'C:\\Users\\ada\\shop-diagram.svg';
const boxes = layout(shopGraph, false).boxes;

function start(more: Record<string, unknown> = {}, answers: Answers = {}): ReturnType<typeof plan> {
  const args = { connection: local.id, database: 'shop', graph: shopGraph, boxes, keysOnly: false, ...more };
  return plan(contextOn('relation.export-svg'), { args, ...answers });
}

function written(svgBoxes: readonly Box[], graph: ReferenceGraph = shopGraph, keysOnly = false): string {
  return diagramSvg(graph, svgBoxes, keysOnly);
}

describe('relation.export-svg', () => {
  it('proposes shop-diagram.svg in the dialog Save the diagram', () => {
    expect(start()).toEqual({ kind: 'read', need: { key: 'file', read: fileReadId, args: dialogArgs('shop') } });
    expect(dialogArgs('shop')).toMatchObject({
      title: 'Save the diagram',
      name: 'shop-diagram.svg',
      kind: 'SVG image',
    });
  });

  it('writes the file and says where, with Open', () => {
    const saved = planOf(start({}, { file: path }));
    const [step] = saved.steps as readonly FileStep[];
    expect(step).toMatchObject({ kind: 'file', text: `write ${path}`, path });
    expect(step?.content).toEqual({ writer: svgWriter, args: { text: written(boxes) } });
    expect(saved.after).toEqual([
      {
        kind: 'notify',
        level: 'success',
        text: `Saved the diagram of shop to ${path}.`,
        actions: [
          {
            label: 'Open',
            feature: 'relation.export-svg',
            target: { kind: 'app' },
            args: { open: path },
          },
        ],
      },
    ]);
    expect(saved.undo).toEqual({ cannot: 'Nothing is written to a deployment; the file can be deleted.' });
  });

  it('opens the file saved with the system’s program from Open', () => {
    const opened = planOf(plan(contextOn('relation.export-svg'), { args: { open: path } }));
    expect(opened.steps).toEqual([
      { kind: 'app', text: `open ${path} with the system's program`, action: openFileAction, args: { path } },
    ]);
  });

  it('writes nothing and says nothing when the dialog is closed', () => {
    expect(fileRead.parse([null], {})).toBeNull();
    const closed = planOf(start({}, { file: null }));
    expect(closed.steps).toEqual([]);
    expect(closed.after).toEqual([]);
  });

  it('is a file that needs nothing else, with every box where it is on the page', () => {
    const moved = boxes.map((box) => (box.name === 'orders' ? { ...box, left: box.left + 200 } : box));
    const svg = written(moved);
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg ')).toBe(true);
    expect(svg.endsWith('</svg>\n')).toBe(true);
    expect(svg).not.toMatch(/<script|<style|@font-face|href="http/u);
    const orders = moved.find((box) => box.name === 'orders');
    expect(svg).toContain(`<rect x="${String(orders?.left)}" y="${String(orders?.top)}" width="240"`);
  });

  it('has a white background and dark text, whatever the theme', () => {
    const svg = written(boxes);
    expect(svg).toMatch(/<rect [^>]*fill="#ffffff"\/>/u);
    expect(svg).toContain('fill="#1f2d3d"');
  });

  it('draws the names, the counts, the marks, the more fields and the views as on the page', () => {
    const graph: ReferenceGraph = {
      ...shopGraph,
      collections: [
        {
          ...withFields('orders', ['_id', ...Array.from({ length: 16 }, (_, at) => `f${String(at)}`)]),
          documents: 1204,
        },
        view('recent', 'orders'),
      ],
      relations: [relation('recent', 'orders', { kind: 'view', field: '', fieldLabel: '', toField: '' })],
    };
    const svg = written(layout(graph, false).boxes, graph);
    expect(svg).toContain('>1,204 docs<');
    expect(svg).toContain('>recent (view)<');
    expect(svg).toContain('>+3 more fields<');
    expect(svg).toContain('>PK · objectId<');
    expect(svg).toContain('stroke-dasharray="5 4"');
    expect(svg).toContain('<title>recent is a view of orders</title>');
  });

  it('applies Keys only', () => {
    const svg = written(layout(shopGraph, true).boxes, shopGraph, true);
    expect(svg).not.toContain('>name<');
    expect(svg).toContain('>email<');
  });

  it('writes nothing for a diagram without collections', () => {
    const empty = planOf(start({ graph: { ...shopGraph, collections: [], relations: [] }, boxes: [] }));
    expect(empty.steps).toEqual([]);
  });

  it('is allowed on a read-only connection: it writes nothing to a deployment', () => {
    const saved = planOf(start({}, { file: path }));
    expect(saved.steps.every((step) => step.kind === 'file')).toBe(true);
  });
});
