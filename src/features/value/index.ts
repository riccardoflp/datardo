/**
 * The Operations and the Reads of the value area, as the runner starts them. Derivations and views are not listed,
 * except `value.stream-groups`, a View whose section has reads of its own.
 */
import type { RunnableFeature } from '../../shared/feature';
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
  { kind: 'operation', id: featureId('value.refresh'), plan: refresh.plan },
  { kind: 'operation', id: featureId('value.copy'), plan: copy.plan },
  { kind: 'operation', id: featureId('value.save-string'), plan: saveString.plan },
  { kind: 'operation', id: featureId('value.add-field'), plan: addField.plan },
  { kind: 'operation', id: featureId('value.edit-field'), plan: editField.plan },
  { kind: 'operation', id: featureId('value.rename-field'), plan: renameField.plan },
  { kind: 'operation', id: featureId('value.remove-fields'), plan: removeFields.plan },
  { kind: 'operation', id: featureId('value.push-element'), plan: pushElement.plan },
  { kind: 'operation', id: featureId('value.edit-element'), plan: editElement.plan },
  { kind: 'operation', id: featureId('value.remove-elements'), plan: removeElements.plan },
  { kind: 'operation', id: featureId('value.trim-list'), plan: trimList.plan },
  { kind: 'operation', id: featureId('value.add-member'), plan: addMember.plan },
  { kind: 'operation', id: featureId('value.remove-members'), plan: removeMembers.plan },
  { kind: 'operation', id: featureId('value.add-scored-member'), plan: addScoredMember.plan },
  { kind: 'operation', id: featureId('value.change-score'), plan: changeScore.plan },
  { kind: 'operation', id: featureId('value.remove-scored-members'), plan: removeScoredMembers.plan },
  { kind: 'operation', id: featureId('value.add-entry'), plan: addEntry.plan },
  { kind: 'operation', id: featureId('value.delete-entries'), plan: deleteEntries.plan },
  { kind: 'operation', id: featureId('value.trim-stream'), plan: trimStream.plan },
];
