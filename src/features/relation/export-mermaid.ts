/**
 * Feature: relation.export-mermaid
 *
 * Copies the diagram as the text of a Mermaid `erDiagram`, to paste into a README, a wiki or an issue: one block per
 * collection with the rows its box shows, one line per relation. Moving boxes does not change it. Started from the
 * page with `{ connection, database, graph, keysOnly }`, the references as the page holds them.
 */
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appPlan, appStep } from '../nav/types';
import { graphArg, requiredStart } from './model/args';
import { firstType, rowMark, shownFields } from './model/rows';
import { text } from './text';
import { compareText, type ReferenceGraph, type Relation, type SampledCollection } from './types';

/** The app action that puts a text on the clipboard. */
export const copyAction = 'nav.copy';

function mermaidName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/gu, '_');
}

function block(collection: SampledCollection, relations: readonly Relation[], keysOnly: boolean): readonly string[] {
  const { rows } = shownFields(collection, relations, keysOnly);
  const lines = rows.map((field) => {
    const mark = rowMark(collection, relations, field);
    const type = mermaidName(firstType(field) ?? 'any');
    return `    ${type} ${mermaidName(field.label.replaceAll('[]', ''))}${mark === undefined ? '' : ` ${mark}`}`;
  });
  return [`  ${mermaidName(collection.name)} {`, ...lines, '  }'];
}

function relationLine(relation: Relation): string {
  const label = relation.kind === 'view' ? 'view of' : relation.fieldLabel;
  const link = relation.kind === 'view' ? '||--||' : relation.several ? '}o--o{' : '}o--||';
  return `  ${mermaidName(relation.from)} ${link} ${mermaidName(relation.to)} : "${label.replaceAll('"', "'")}"`;
}

/** The text of the diagram as a Mermaid `erDiagram`, ending with a new line. */
export function mermaidText(graph: ReferenceGraph, keysOnly: boolean): string {
  const collections = [...graph.collections].sort((left, right) => compareText(left.name, right.name));
  const lines = [
    'erDiagram',
    ...collections.flatMap((collection) => block(collection, graph.relations, keysOnly)),
    ...graph.relations.map(relationLine),
  ];
  return `${lines.join('\n')}\n`;
}

/** Feature: relation.export-mermaid — copies the Mermaid text of the diagram; says *Copied to the clipboard*. */
export function plan(context: Context, answers: Answers): Outcome {
  const { args, place } = requiredStart(context, answers);
  const graph = graphArg(args);
  if (graph === undefined || graph.collections.length === 0) {
    return run(appPlan(text.mermaid.title, []));
  }
  const copied = mermaidText(graph, args['keysOnly'] === true);
  return run({
    ...appPlan(text.mermaid.title, [appStep(text.mermaid.step(place.database), copyAction, { text: copied })]),
    danger: noDanger,
    undo: { cannot: text.mermaid.nothingWritten },
    after: [{ kind: 'notify', level: 'success', text: text.copied }],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('relation.export-mermaid'), plan };
