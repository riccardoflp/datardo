/**
 * The words of the MCP server's area, as the cards write them: the setup's entries, the dialog of the port, the
 * notifications, the tooltips of the top bar, the server's instructions to the AI.
 */
export const text = {
  /**
   * The instructions of `initialize`, naming only the tools offered: `names` writes those of a list that are offered,
   * joined by commas.
   */
  instructions: (names: (tools: readonly string[]) => string): string =>
    [
      "Datardo is the database client open on the user's computer. Its tools read the MongoDB and Redis connections the user saved there and never write to a database.",
      'Start with list_connections: each connection says its engine.',
      `MongoDB, to explore and read: ${names(['list_databases', 'list_collections', 'describe_collection', 'find_documents', 'aggregate'])}; for quick questions: ${names(['count_documents', 'distinct_values', 'describe_relations', 'collection_options', 'list_saved_queries'])}.`,
      `To follow what an application writes: ${names(['watch_changes', 'write_history', 'datardo_writes', 'datardo_write_details', 'redis_oplog_status'])}. datardo_writes and datardo_write_details are the writes made from Datardo.`,
      `To find what makes a database slow: ${names(['explain_query', 'slow_queries', 'current_operations', 'index_advice', 'collection_stats'])}. The deployment: ${names(['server_status', 'database_stats', 'replica_set_status', 'sharding_status'])}.`,
      `Redis: ${names(['redis_scan_keys', 'redis_key_details', 'redis_read_value'])}; the server: ${names(['redis_server_info', 'redis_slow_log', 'redis_clients', 'redis_memory'])}.`,
      'Filters, sorts, projections and pipelines are in mongosh syntax: ObjectId("…"), ISODate("…"), /re/i.',
      `The tools whose name starts with open_ or redis_open_ show the results to the user in a tab of Datardo: ${names(['open_query', 'open_aggregation', 'open_explain', 'open_search', 'open_watch', 'open_monitor', 'open_history', 'redis_open_keys', 'redis_open_key', 'redis_open_server'])}.`,
    ].join('\n'),
  server: {
    startTitle: (url: string) => `start the MCP server on ${url}`,
    stopTitle: 'stop the MCP server',
    nothingToUndo: 'Nothing to undo: turning datardo.mcp.enabled off stops the server.',
    taken: (port: number) => `Port ${String(port)} is used by another program.`,
    warning: (why: string) => `Datardo's MCP server is not running. ${why}`,
    changePort: 'Change port',
  },
  token: {
    title: 'store a new access token of the MCP server',
    cannot: 'Cannot be undone: the old token is gone. The clients work again once the configuration is copied again.',
    notification: "Datardo's MCP server has a new access token: copy the configuration again.",
  },
  setup: {
    title: (status: string) => `Datardo MCP server · ${status}`,
    line: 'Copy the configuration for your AI assistant.',
    button: 'Choose',
    running: (url: string) => `Running on ${url}`,
    off: 'Off',
    notRunning: (why: string) => `Not running: ${why}`,
    starting: 'starting',
    turnOn: 'Turn the server on',
    turnOff: 'Turn the server off',
    claude: 'Copy the command for Claude Code',
    json: 'Copy the JSON configuration',
    jsonLine: 'For the mcpServers of .mcp.json, Cursor, Windsurf and other clients that support HTTP servers',
    log: 'Show the log',
    logLine: 'The tools the AI called',
    port: 'Change the port…',
    portLine: (port: number) => `Now ${String(port)}. The configured clients need the new address`,
    token: 'Generate a new access token',
    tokenLine: 'The configured clients stop working until they get the new one',
    copyStep: 'copy to the clipboard',
    copied: 'Copied. It contains the access token of the MCP server: keep it private.',
    hiddenToken: '…',
    nothingToUndo: 'Nothing to undo.',
  },
  port: {
    title: "Port of Datardo's MCP server",
    line: (now: string) => `On 127.0.0.1, now ${now}. The AI clients you configured need the new address afterwards.`,
    taken: (port: number) => `${String(port)} (taken)`,
    label: 'Port',
    button: 'Change port',
    rule: 'A number from 1024 to 65535',
    moved: (to: number, from: number) =>
      `Datardo's MCP server now listens on port ${String(to)}. Give the new address to the AI clients configured with port ${String(from)}.`,
    copy: 'Copy configuration…',
    cannot: 'Run it again with the old port.',
  },
  status: {
    label: 'MCP',
    off: 'MCP server: off. Click to set it up.',
    running: (url: string) => `MCP server: running on ${url}`,
    starting: 'MCP server: starting',
    notRunning: (why: string) => `MCP server: not running. ${why}`,
  },
  commands: {
    setup: 'Set up the MCP server for AI assistants…',
    token: 'Generate a new MCP access token',
    port: 'Change MCP server port…',
  },
} as const;
