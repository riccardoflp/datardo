/**
 * The Operations and the Reads of the value area, as the runner starts them. Derivations and views are not listed,
 * except `value.stream-groups`, a View whose section has reads of its own.
 */
import type { OperationFeature, RunnableFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import * as addEntry from './add-entry';
import * as addField from './add-field';
import * as addMember from './add-member';
import * as addScoredMember from './add-scored-member';
import * as changeScore from './change-score';
import * as check from './check';
import * as copy from './copy';
import * as count from './count';
import * as deleteEntries from './delete-entries';
import * as editElement from './edit-element';
import * as editField from './edit-field';
import * as pushElement from './push-element';
import * as readHash from './read-hash';
import * as readList from './read-list';
import * as readSet from './read-set';
import * as readSortedSet from './read-sorted-set';
import * as readStream from './read-stream';
import * as readString from './read-string';
import * as refresh from './refresh';
import * as removeElements from './remove-elements';
import * as removeFields from './remove-fields';
import * as removeMembers from './remove-members';
import * as removeScoredMembers from './remove-scored-members';
import * as renameField from './rename-field';
import * as saveString from './save-string';
import * as streamGroups from './stream-groups';
import * as trimList from './trim-list';
import * as trimStream from './trim-stream';
import { withArgs } from './types';

/** An Operation of this area, given the arguments it was started with as answers (`withArgs`). */
function operation(id: string, plan: OperationFeature['plan']): OperationFeature {
  return { kind: 'operation', id: featureId(id), plan: (context, answers) => plan(context, withArgs(answers)) };
}

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  { kind: 'read', id: featureId('value.check'), request: check.request, parse: check.parse },
  { kind: 'read', id: featureId('value.count'), request: count.request, parse: count.parse },
  { kind: 'read', id: featureId('value.read-string'), request: readString.request, parse: readString.parse },
  { kind: 'read', id: featureId('value.read-hash'), request: readHash.request, parse: readHash.parse },
  { kind: 'read', id: featureId('value.read-list'), request: readList.request, parse: readList.parse },
  { kind: 'read', id: featureId('value.read-set'), request: readSet.request, parse: readSet.parse },
  { kind: 'read', id: featureId('value.read-sorted-set'), request: readSortedSet.request, parse: readSortedSet.parse },
  { kind: 'read', id: featureId('value.read-stream'), request: readStream.request, parse: readStream.parse },
  { kind: 'read', id: featureId('value.stream-groups'), request: streamGroups.request, parse: streamGroups.parse },
  operation('value.refresh', refresh.plan),
  operation('value.copy', copy.plan),
  operation('value.save-string', saveString.plan),
  operation('value.add-field', addField.plan),
  operation('value.edit-field', editField.plan),
  operation('value.rename-field', renameField.plan),
  operation('value.remove-fields', removeFields.plan),
  operation('value.push-element', pushElement.plan),
  operation('value.edit-element', editElement.plan),
  operation('value.remove-elements', removeElements.plan),
  operation('value.trim-list', trimList.plan),
  operation('value.add-member', addMember.plan),
  operation('value.remove-members', removeMembers.plan),
  operation('value.add-scored-member', addScoredMember.plan),
  operation('value.change-score', changeScore.plan),
  operation('value.remove-scored-members', removeScoredMembers.plan),
  operation('value.add-entry', addEntry.plan),
  operation('value.delete-entries', deleteEntries.plan),
  operation('value.trim-stream', trimStream.plan),
];
