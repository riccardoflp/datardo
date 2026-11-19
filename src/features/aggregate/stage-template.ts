/**
 * Feature: aggregate.stage-template
 *
 * The starting body of a stage, by its name, so that a stage starts from something that already parses; and the body
 * a stage keeps or takes when its name changes. A body on several lines is indented by two spaces.
 */
import type { Stage } from './types';

/** The templates, in the order of the suggestions of a stage name: `$match` first and `$merge` last. */
export const stageTemplates: ReadonlyMap<string, string> = new Map([
  ['$match', '{\n  \n}'],
  ['$project', '{\n  field: 1\n}'],
  ['$addFields', '{\n  newField: "$field"\n}'],
  ['$set', '{\n  field: "value"\n}'],
  ['$unset', '"field"'],
  ['$group', '{\n  _id: "$field",\n  count: { $sum: 1 }\n}'],
  ['$sort', '{\n  field: -1\n}'],
  ['$limit', '10'],
  ['$skip', '10'],
  ['$unwind', '"$arrayField"'],
  ['$lookup', '{\n  from: "collection",\n  localField: "field",\n  foreignField: "_id",\n  as: "joined"\n}'],
  ['$count', '"count"'],
  ['$sortByCount', '"$field"'],
  ['$replaceRoot', '{\n  newRoot: "$field"\n}'],
  ['$sample', '{\n  size: 10\n}'],
  ['$facet', '{\n  facetName: [\n    { $count: "count" }\n  ]\n}'],
  ['$bucket', '{\n  groupBy: "$field",\n  boundaries: [0, 10, 100],\n  default: "other"\n}'],
  ['$search', '{\n  index: "default",\n  text: {\n    query: "word",\n    path: "field"\n  }\n}'],
  ['$searchMeta', '{\n  index: "default",\n  exists: { path: "field" },\n  count: { type: "total" }\n}'],
  [
    '$vectorSearch',
    '{\n  index: "vector_index",\n  path: "embedding",\n  queryVector: [0.1, 0.2, 0.3],\n  numCandidates: 100,\n  limit: 10\n}',
  ],
  ['$out', '"outputCollection"'],
  ['$merge', '{\n  into: "outputCollection"\n}'],
]);

/** The names the suggestions of a stage name list, in their order. */
export const stageTemplateNames: readonly string[] = [...stageTemplates.keys()];

/** Feature: aggregate.stage-template — the template of a stage name, trimmed; `undefined` when it has none. */
export function stageTemplate(name: string): string | undefined {
  return stageTemplates.get(name.trim());
}

/**
 * Feature: aggregate.stage-template — the body of a stage after its name changes to `name`. `stage` is the stage with
 * the name it had when the field was focused: an empty body, or exactly the template of that name, becomes the
 * template of the new name when it has one; any other body is left as it is.
 */
export function bodyAfterRename(stage: Pick<Stage, 'name' | 'body'>, name: string): string {
  const template = stageTemplate(name);
  const untouched = stage.body.trim() === '' || stage.body === stageTemplate(stage.name);
  return template !== undefined && untouched ? template : stage.body;
}
