# @agent-arc-status/cli — `arc-status`

A **zero-dependency** command-line viewer for the [Agent Arc Status
Protocol](https://github.com/joethefisher/agent-arc-status). Point it at a JSONL stream (file, stdin,
or a live webhook) and see arcs render, validate, and nest.

```bash
npx @agent-arc-status/cli render examples/03-long-autonomous.jsonl
# ▶ build ...
# ✓ [4/11] ...
# · still working ...
# ■ v0.1 complete ...
```

## Commands

| Command | What it does |
|---|---|
| `arc-status render <file\|->` | Render each event to a colored line (`--json`, `--body`, `--no-color`) |
| `arc-status validate <file\|->` | Validate events + phase ordering; **exit 1** on failure (`--partial`, `--monotonic`, `--json`) — CI-friendly |
| `arc-status tree <file\|->` | Render arcs as a delegation tree via `x_parent_arc_id` (flat if none) |
| `arc-status tail <file> [--follow]` | Render a file, optionally re-rendering appended events |
| `arc-status serve [--port 8787] [--host 127.0.0.1]` | Run a webhook receiver that validates and renders events live |

Exit codes: `0` ok · `1` invalid · `2` usage · `3` I/O. Color auto-disables when piped or when
`NO_COLOR` / `--no-color` is set.

```bash
cat events.jsonl | arc-status validate -     # exit 1 if anything is malformed
arc-status serve --port 8787                  # POST arc.status events here to watch them live
```

`serve` binds `127.0.0.1` by default, caps request bodies at 64KB, and treats every event as data,
never instruction (spec §9.4). The testable core is `run(argv, io)` exported from the package.
