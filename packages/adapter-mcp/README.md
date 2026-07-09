# @agent-arc-status/adapter-mcp

Bridge [Model Context Protocol](https://modelcontextprotocol.io) progress notifications and
[Agent Arc Status Protocol](https://github.com/joethefisher/agent-arc-status) events — **both
directions**. `@modelcontextprotocol/sdk` is a peer dependency.

An MCP tool that runs for minutes is silent from MCP's perspective until it returns; emitting
arc.status events from its progress notifications makes that in-flight work observable to humans and
other agents.

```ts
import { mcpProgressNotifier, arcToMcpProgress } from "@agent-arc-status/adapter-mcp";

// MCP progress -> arc.status (attach where you receive notifications/progress):
const notify = mcpProgressNotifier(emit, { arcId, title: "reindex corpus" });
notify({ progressToken: token, progress: 3, total: 8, message: "shard 3 of 8" });

// arc.status -> MCP progress (to report an arc's progress over MCP):
const params = arcToMcpProgress(event, token);
```

| MCP concept | arc concept |
|---|---|
| `progress` / `total` | `step` / `total` (when positive integers) |
| progress `message` | `title` |
| a progress notification | a `milestone` event |

`progress === total` is a candidate for `done` only when the tool actually returns — progress alone
is not an honest `done` (spec §6.5).
