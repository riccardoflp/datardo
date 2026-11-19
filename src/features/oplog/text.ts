/**
 * The text of the interface of redis-oplog, word for word from its cards (R10.1).
 */

/** The texts of publishing and of its warning. */
export const oplogText = {
  publishTitle: (database: string, collection: string): string =>
    `Publish the writes of ${database}.${collection} for redis-oplog`,
  cannotUndo: "An event sent can't be withdrawn: undoing the write publishes the events of the undo.",
  warning: (connection: string, error: string): string =>
    `The change was saved, but couldn't be published to Redis for redis-oplog (${connection}): ${error}`,
  noAnswer: (host: string, port: number): string => `Redis ${host}:${String(port)} didn't answer in 5 seconds`,
  missingLink: 'The linked connection is missing: choose it again in the connection.',
} as const;
