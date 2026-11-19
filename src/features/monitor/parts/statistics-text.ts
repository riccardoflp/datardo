/**
 * The text of the interface of the Stats section of the Monitor page and of its Reads, word for word as their cards
 * write it (`monitor.stats`, `monitor.rates`); `text.ts` gathers it with the rest of the area's (R10.1).
 */

/** The words of this part of the Monitor page. */
export const statisticsText = {
  tiles: {
    server: 'Server',
    uptime: 'Uptime',
    connections: 'Connections',
    connectionsLine: (available: string, created: string) => `${available} available · ${created} created`,
    operationsPerSecond: 'Operations / s',
    operations: 'Operations',
    sinceStart: 'since start · rates after the next refresh',
    network: 'Network / s',
    bytesIn: (size: string) => `↓ ${size}`,
    bytesOut: (size: string) => `↑ ${size}`,
    memory: 'Memory',
    megabytes: (count: string) => `${count} MB`,
    virtual: (count: string) => `${count} MB virtual`,
  },
  databases: {
    title: 'Databases',
    columns: {
      name: 'Database',
      collections: 'Collections',
      views: 'Views',
      documents: 'Documents',
      data: 'Data',
      storage: 'Storage',
      indexes: 'Indexes',
      indexSize: 'Index size',
    },
  },
  collections: {
    title: (database: string) => `Collections of ${database}`,
    columns: {
      name: 'Collection',
      type: 'Type',
      documents: 'Documents',
      averageSize: 'Avg size',
      data: 'Data',
      storage: 'Storage',
      indexes: 'Indexes',
      indexSize: 'Index size',
    },
  },
} as const;
