/**
 * Work in progress (`runner.progress`): a read or a plan that runs longer than 400 ms becomes an item of the list,
 * with what cancels it (`runner.cancel`). One that ends sooner never shows; one that failed stays until dismissed.
 */
import type { ConnectionId, FeatureId, WorkId } from '../shared/ids';
import type { Work } from '../shared/state/runner';
import type { RunnerPorts } from './ports';

/** Work shows as in progress after 400 ms (Datardo's choice). */
export const showAfterMs = 400;

/** What a piece of work needs: the state and the time. */
export type WorkPorts = Pick<RunnerPorts, 'state' | 'now'>;

/** What a piece of work is when it starts. */
export interface WorkStart {
  readonly feature: FeatureId;
  readonly title: string;
  readonly connection?: ConnectionId;
  /** What else cancels it: the signal of the intent, when there is one. */
  readonly signal?: AbortSignal;
}

/** One read or plan being run, and what cancels it. */
export class RunningWork {
  readonly signal: AbortSignal;
  private readonly controller = new AbortController();
  private shown = false;
  private ended = false;
  private item: Work;
  private readonly timer: ReturnType<typeof setTimeout>;

  /** Starts it; it shows after 400 ms if it has not ended. */
  constructor(
    private readonly ports: WorkPorts,
    readonly id: WorkId,
    start: WorkStart,
    private readonly onEnd: (id: WorkId) => void,
  ) {
    this.signal = this.controller.signal;
    start.signal?.addEventListener('abort', () => {
      this.controller.abort();
    });
    this.item = {
      id,
      feature: start.feature,
      title: start.title,
      started: ports.now(),
      ...(start.connection === undefined ? {} : { connection: start.connection }),
    };
    this.timer = setTimeout(() => {
      this.show();
    }, showAfterMs);
  }

  /** The feature it runs. */
  get feature(): FeatureId {
    return this.item.feature;
  }

  /** Whether it can still be cancelled. */
  get cannotCancel(): string | undefined {
    return this.item.cannotCancel;
  }

  /** Changes what the item says: its title, its progress, why it cannot be cancelled. */
  change(work: Partial<Omit<Work, 'id'>>): void {
    this.item = { ...this.item, ...work };
    if (this.shown) {
      this.ports.state.dispatch({ slice: 'runner', type: 'work-changed', id: this.id, work });
    }
  }

  /** Cancels it: the signal is raised and the item says *Cancelled*. False when it cannot be cancelled. */
  cancel(): boolean {
    if (this.ended || this.item.cannotCancel !== undefined) {
      return false;
    }
    this.change({ cancelled: true });
    this.controller.abort();
    return true;
  }

  /** It ended: it leaves the list, or stays with its error until dismissed when it failed. */
  end(error?: string): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    clearTimeout(this.timer);
    this.onEnd(this.id);
    if (!this.shown) {
      return;
    }
    if (error === undefined || this.item.cancelled === true) {
      this.ports.state.dispatch({ slice: 'runner', type: 'work-ended', id: this.id });
    } else {
      this.change({ error });
    }
  }

  private show(): void {
    if (this.ended || this.shown) {
      return;
    }
    this.shown = true;
    this.ports.state.dispatch({ slice: 'runner', type: 'work-started', work: this.item });
  }
}

/** The work running now, by identifier. */
export class WorkRegistry {
  private next = 1;
  private readonly running = new Map<WorkId, RunningWork>();

  /** Keeps the work of the runner given these ports. */
  constructor(private readonly ports: WorkPorts) {}

  /** Starts a piece of work. */
  begin(start: WorkStart): RunningWork {
    const id = `work-${String(this.next++)}` as WorkId;
    const work = new RunningWork(this.ports, id, start, (ended) => this.running.delete(ended));
    this.running.set(id, work);
    return work;
  }

  /** The work with this identifier, while it runs. */
  get(id: WorkId): RunningWork | undefined {
    return this.running.get(id);
  }

  /** The work started last, for the command `runner.cancel`. */
  latest(): RunningWork | undefined {
    return [...this.running.values()].at(-1);
  }
}
