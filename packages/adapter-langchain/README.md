# @agent-arc-status/adapter-langchain

A [LangChain](https://js.langchain.com) callback handler that emits
[Agent Arc Status Protocol](https://github.com/joethefisher/agent-arc-status) events at
chain/agent boundaries. `@langchain/core` is a peer dependency.

```ts
import { ArcStatusCallbackHandler } from "@agent-arc-status/adapter-langchain";
import { randomUUID } from "node:crypto";

const arc = new ArcStatusCallbackHandler({
  emit: (event) => bus.publish(event), // any EmitFn: HTTP, queue, stdout…
  arcId: randomUUID(),
  arcKind: "agent",
});

await agentExecutor.invoke({ input }, { callbacks: [arc] });
```

| LangChain callback | arc phase |
|---|---|
| root `handleChainStart` (no parent run) | `started` |
| `handleAgentAction` | `milestone` |
| `handleLLMStart` / `handleToolStart` | *(dropped — per-call milestones are an anti-pattern, §5.3)* |
| root `handleChainEnd` | `done` |
| `handleChainError` | terminal `blocked` |

The handler tracks the root run id, so nested chains don't produce extra `started`/`done` events —
every stream it emits is `validateSequence`-clean.
