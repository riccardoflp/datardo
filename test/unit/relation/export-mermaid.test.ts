import { describe, expect, it } from 'vitest';
import { copyAction, mermaidText, plan } from '../../../src/features/relation/export-mermaid';
import type { ReferenceGraph } from '../../../src/features/relation/types';
import { contextOn, local, oid, planOf, relation, sampled, shopGraph, view } from './context';

const example = `erDiagram
  customers {
    objectId _id PK
    string name
    string email UK
  }
  orders {
    objectId _id PK
    objectId customerId FK
    string productId FK
    double total
  }
  products {
    string _id PK
    string name
  }
  orders }o--|| customers : "customerId"
  orders }o--|| products : "productId"
`;

function start(args: Record<string, unknown>): ReturnType<typeof plan> {
  return plan(contextOn('relation.export-mermaid'), { args: { connection: local.id, database: 'shop', ...args } });
}

describe('relation.export-mermaid', () => {
  it('copies the worked example exactly, with a new line at its end', () => {
    expect(mermaidText(shopGraph, false)).toBe(example);
    const copied = planOf(start({ graph: shopGraph, keysOnly: false }));
    expect(copied.steps).toEqual([
      {
        kind: 'app',
        text: 'copy the Mermaid diagram of shop to the clipboard',
        action: copyAction,
        args: { text: example },
      },
    ]);
    expect(copied.after).toEqual([{ kind: 'notify', level: 'success', text: 'Copied to the clipboard' }]);
    expect(copied.undo).toEqual({ cannot: 'Nothing is written to a deployment.' });
  });

  it('writes a field inside an array without [] and its relation as many-to-many', () => {
    const graph: ReferenceGraph = {
      ...shopGraph,
      collections: [
        sampled('orders', [{ _id: oid('2'), items: [{ productId: 'P-1' }] }]),
        sampled('products', [{ _id: 'P-1' }]),
      ],
      relations: [
        relation('orders.items.productId', 'products._id', { fieldLabel: 'items[].productId', several: true }),
      ],
    };
    const text = mermaidText(graph, false);
    expect(text).toContain('    string items_productId FK\n');
    expect(text).toContain('  orders }o--o{ products : "items[].productId"\n');
  });

  it('writes a view recent on orders as a view of', () => {
    const graph: ReferenceGraph = {
      ...shopGraph,
      collections: [sampled('orders', [{ _id: oid('2') }]), view('recent', 'orders')],
      relations: [relation('recent', 'orders', { kind: 'view', field: '', fieldLabel: '', toField: '' })],
    };
    expect(mermaidText(graph, false)).toContain('  recent ||--|| orders : "view of"\n');
  });

  it('writes crm.customers as crm_customers in its block and its relations', () => {
    const graph: ReferenceGraph = {
      ...shopGraph,
      collections: [
        sampled('crm.customers', [{ _id: oid('1') }]),
        sampled('orders', [{ _id: oid('2'), customerId: oid('1') }]),
      ],
      relations: [{ ...relation('orders.customerId', 'customers._id'), to: 'crm.customers' }],
    };
    const text = mermaidText(graph, false);
    expect(text).toContain('  crm_customers {\n');
    expect(text).toContain('  orders }o--|| crm_customers : "customerId"\n');
  });

  it('keeps only _id, the unique fields and the fields of relations with Keys only', () => {
    const text = mermaidText(shopGraph, true);
    expect(text).toContain('  customers {\n    objectId _id PK\n    string email UK\n  }\n');
    expect(text).toContain(
      '  orders {\n    objectId _id PK\n    objectId customerId FK\n    string productId FK\n  }\n',
    );
    expect(text).toContain('  products {\n    string _id PK\n  }\n');
  });

  it('does not change with moved boxes', () => {
    const moved = planOf(start({ graph: shopGraph, boxes: [{ name: 'orders', left: 900, top: 900 }] }));
    expect(moved.steps[0]).toMatchObject({ args: { text: example } });
  });

  it('copies nothing from a diagram without collections', () => {
    expect(planOf(start({ graph: { ...shopGraph, collections: [], relations: [] } })).steps).toEqual([]);
  });
});
