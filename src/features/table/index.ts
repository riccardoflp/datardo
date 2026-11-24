/**
 * The Operations and the Reads of the table area, as the runner starts them. Its Derivations and Views are not
 * listed: the window calls them.
 */
import type { RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as addFormatRule from './add-format-rule';
import * as arrangeColumns from './arrange-columns';
import * as collapse from './collapse';
import * as colorByField from './color-by-field';
import * as copyAs from './copy-as';
import * as copyPath from './copy-path';
import * as copyValue from './copy-value';
import * as editFieldRule from './edit-field-rule';
import * as editFormatRule from './edit-format-rule';
import * as expand from './expand';
import * as exportFormatting from './export-formatting';
import * as importFormatting from './import-formatting';
import * as moveFormatRule from './move-format-rule';
import * as refresh from './refresh';
import * as toggleFormatting from './toggle-formatting';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'operation', id: featureId('table.expand'), plan: expand.plan },
  { kind: 'operation', id: featureId('table.collapse'), plan: collapse.plan },
  { kind: 'operation', id: featureId('table.arrange-columns'), plan: arrangeColumns.plan },
  { kind: 'operation', id: featureId('table.copy-as'), plan: copyAs.plan },
  { kind: 'operation', id: featureId('table.copy-value'), plan: copyValue.plan },
  { kind: 'operation', id: featureId('table.copy-path'), plan: copyPath.plan },
  { kind: 'read', id: featureId('table.refresh'), request: refresh.request, parse: refresh.parse },
  { kind: 'operation', id: featureId('table.add-format-rule'), plan: addFormatRule.plan },
  { kind: 'operation', id: featureId('table.edit-format-rule'), plan: editFormatRule.plan },
  { kind: 'operation', id: featureId('table.toggle-formatting'), plan: toggleFormatting.plan },
  { kind: 'operation', id: featureId('table.color-by-field'), plan: colorByField.plan },
  { kind: 'operation', id: featureId('table.edit-field-rule'), plan: editFieldRule.plan },
  { kind: 'operation', id: featureId('table.move-format-rule'), plan: moveFormatRule.plan },
  { kind: 'operation', id: featureId('table.export-formatting'), plan: exportFormatting.plan },
  exportFormatting.fileRead,
  { kind: 'operation', id: featureId('table.import-formatting'), plan: importFormatting.plan },
  importFormatting.fileRead,
];
