/**
 * Plans on the same connection run one after the other, in the order they were confirmed (`runner.run`).
 */

/** One line of waiting plans for each connection. */
export class ConnectionQueue {
  private readonly tails = new Map<string, Promise<void>>();

  /** Runs `task` once every plan before it on the same keys has ended, whatever their outcome. */
  async run<T>(keys: readonly string[], task: () => Promise<T>): Promise<T> {
    const unique = [...new Set(keys)].sort();
    const before = unique.map((key) => this.tails.get(key) ?? Promise.resolve());
    const result = Promise.all(before).then(task);
    // The next plan waits for this one to end, not for it to succeed: its error is the caller's, below.
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    for (const key of unique) {
      this.tails.set(key, tail);
    }
    try {
      return await result;
    } finally {
      for (const key of unique) {
        if (this.tails.get(key) === tail) {
          this.tails.delete(key);
        }
      }
    }
  }
}
