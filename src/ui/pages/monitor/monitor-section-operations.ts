/**
 * The Operations of the Replication and Sharding sections, as their controls start them: **Step down…**
 * (`monitor.step-down`), then what the section says and the replica set read again 1.5 seconds later; **Stop
 * balancer…** and **Start balancer…** (`monitor.set-balancer`), **Disable balancing…** and **Enable balancing…**
 * (`monitor.set-collection-balancing`), then what the section says and the cluster read again, in full, 1 second
 * later. A failure of the server is the section's error line; closing the confirmation changes nothing.
 */
import { text } from '../../../features/monitor/text';
import type { MonitorSection } from '../../../features/monitor/types';
import type { Json } from '../../../shared/engine-request';
import type { Place } from '../../../shared/ids';
import { readSection, withOperationOutcome } from './monitor-reads';
import { startOn } from './monitor-start';
import { changeMonitorTab, monitorTabOf, type MonitorTab } from './monitor-store';

/** How long after a step down the replica set is read again, in ms (`monitor.step-down`, "After"). */
const afterStepDownMs = 1500;

/** How long after a change of the balancer the cluster is read again, in ms (`monitor.set-balancer`, "After"). */
const afterBalancerMs = 1000;

function fieldOf(args: Json, name: string): string {
  const value =
    typeof args === 'object' && args !== null && !Array.isArray(args)
      ? (args as Readonly<Record<string, Json>>)[name]
      : undefined;
  return typeof value === 'string' ? value : '';
}

/** What the section says once the Operation ran. */
function noticeOf(state: MonitorTab, feature: string, args: Json): string {
  const sharding = text.sharding;
  switch (feature) {
    case 'monitor.step-down':
      return text.replication.stepDown.done(state.replication.replicaSet?.primary ?? '');
    case 'monitor.set-balancer':
      return fieldOf(args, 'balancer') === 'start' ? sharding.setBalancer.started : sharding.setBalancer.stopped;
    default: {
      const namespace = fieldOf(args, 'namespace');
      const way = sharding.setCollectionBalancing.byCommand;
      return fieldOf(args, 'balancing') === 'enable'
        ? sharding.setCollectionBalancing.enabled(namespace, way)
        : sharding.setCollectionBalancing.disabled(namespace, way);
    }
  }
}

function sectionOfFeature(feature: string): MonitorSection {
  return feature === 'monitor.step-down' ? 'replication' : 'sharding';
}

function later(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/** Runs an Operation of the Replication or Sharding section, then reads its section again. */
export async function runSectionOperation(tab: string, feature: string, args: Json, place: Place): Promise<void> {
  const state = monitorTabOf(tab);
  if (state === undefined) {
    return;
  }
  const section = sectionOfFeature(feature);
  const notice = noticeOf(state, feature, args);
  const result = await startOn(state, feature, place, args);
  if (result.kind !== 'done' && result.kind !== 'failed') {
    return;
  }
  changeMonitorTab(tab, (now) =>
    withOperationOutcome(now, section, result.kind === 'done' ? { notice } : { error: result.message }),
  );
  await later(section === 'replication' ? afterStepDownMs : afterBalancerMs);
  await readSection(tab, section, 'refresh');
}
