/**
 * What a connection form tab keeps while it is open (`connection.form`): what is typed, whether a test or a save runs,
 * and how the last one went. What is typed stays while another tab is in front, in the memory of the window only:
 * nothing typed is written to disk before **Save**, and a typed password never leaves the window except to the main
 * process with **Test connection** or **Save** (R14.3).
 */
import { useState } from 'react';
import type { FormState } from '../../../features/connection/form';
import { initialForm, refusedField, withPasswordMoved } from '../../../features/connection/form';
import { withRedisMode } from '../../../features/connection/redis-string';
import type { TestResult } from '../../../features/connection/test';
import type { ConnectionForm, FormField } from '../../../shared/connection';
import type { Json } from '../../../shared/engine-request';
import { featureId, type TabId } from '../../../shared/ids';
import { savedConnection } from '../../../shared/state/connections';
import { appTarget } from '../../../shared/target';
import { useAppState } from '../../state/store';
import { startFeature } from '../../shell/intent';

/** What each open form tab keeps, by tab: forgotten when its tab is closed. */
const drafts = new Map<TabId, Omit<FormState, 'connections'>>();

/** Forgets what was typed in the form tabs that are no longer open. */
export function forgetClosedForms(open: readonly TabId[]): void {
  for (const tab of drafts.keys()) {
    if (!open.includes(tab)) {
      drafts.delete(tab);
    }
  }
}

/** What the form tab can do. */
export interface FormActions {
  readonly state: FormState;
  /** Changes what is typed; typing in the marked field takes its mark away. */
  readonly change: (form: ConnectionForm, field?: FormField) => void;
  readonly redisMode: (mode: ConnectionForm['redisMode']) => void;
  /** The connection string loses the focus: a password typed in it moves to **Password**. */
  readonly leaveString: () => void;
  readonly test: () => void;
  readonly save: (connect: boolean) => void;
  readonly cancel: () => void;
  /** **Browse…**: the system's dialog, then the path chosen in the field. */
  readonly browse: (title: string, kind: string, chosen: (path: string) => void) => void;
}

/** The form of a tab, and what it can do. */
export function useConnectionForm(tab: TabId, opened: FormState['opened']): FormActions {
  const connections = useAppState().connections;
  const [kept, setKept] = useState(() => drafts.get(tab) ?? { opened, form: initialForm(opened, connections) });
  const keep = (next: Omit<FormState, 'connections'>): void => {
    drafts.set(tab, next);
    setKept(next);
  };
  const state: FormState = { ...kept, connections };
  const saved = opened.edits === undefined ? undefined : savedConnection(connections, opened.edits);
  const args = (more: Readonly<Record<string, Json>> = {}): Json => ({
    form: kept.form as unknown as Json,
    connection: opened.edits ?? null,
    ...more,
  });
  const ended = (result: TestResult): void => {
    const latest = drafts.get(tab) ?? kept;
    const { busy: _done, ...rest } = latest;
    keep({ ...rest, result });
  };
  const refusal = (message: string): TestResult => {
    const field = refusedField(kept.form, saved, message);
    return { ok: false, text: message, ...(field === undefined ? {} : { field }) };
  };
  const send = async (busy: 'testing' | 'saving', feature: string, more?: Readonly<Record<string, Json>>) => {
    const { result: _old, ...rest } = kept;
    keep({ ...rest, busy });
    const result = await window.datardo.start({
      feature: featureId(feature),
      target: appTarget,
      place: 'form',
      args: args(more),
    });
    if (result.kind === 'read') {
      ended(result.result as TestResult);
    } else if (result.kind === 'refused' || result.kind === 'failed') {
      ended(refusal(result.message));
    } else if (drafts.has(tab)) {
      const latest = drafts.get(tab) ?? kept;
      const { busy: _done, ...still } = latest;
      keep(still);
    }
  };
  return {
    state,
    change: (form, field) => {
      const result = kept.result;
      const unmarked =
        result !== undefined && field !== undefined && result.field === field
          ? { result: { ok: result.ok, text: result.text } }
          : {};
      keep({ ...kept, form, ...unmarked });
    },
    redisMode: (mode) => {
      keep({ ...kept, form: withRedisMode(kept.form, mode) });
    },
    leaveString: () => {
      const moved = withPasswordMoved(kept.form);
      if (moved !== kept.form) {
        keep({ ...kept, form: moved });
      }
    },
    test: () => void send('testing', 'connection.test'),
    save: (connect) => void send('saving', 'connection.save', connect ? { connect: true } : {}),
    cancel: () => {
      drafts.delete(tab);
      startFeature('tab.close', { place: 'form', args: { tab } });
    },
    browse: (title, kind, chosen) => {
      void window.datardo
        .start({ feature: featureId('connection.form'), target: appTarget, place: 'form', args: { title, kind } })
        .then((result) => {
          if (result.kind === 'read' && typeof result.result === 'string') {
            chosen(result.result);
          }
        });
    },
  };
}
