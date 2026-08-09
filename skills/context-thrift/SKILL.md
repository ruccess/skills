---
name: context-thrift
description: Use in any agent session where token cost matters — before fanning out tool calls, exploring a codebase, waiting on CI or builds, or deciding whether to delegate work to subagents.
---

# context-thrift — Spend context like money

## Core
Every tool call re-reads the entire conversation as cached input, so cost ≈ calls × context size. Cut the calls, cut the context, or both.

Measured on a real session: 855 tool calls spread across 854 messages (parallelism 1.00) — the round-trips alone burned 400M cache-read tokens, 62% of the session's cost. Batching the same calls three-per-message cuts that by two thirds.

## Rules

1. **Batch independent calls.** Put every independent read, grep, and check into ONE message. Go sequential only when call B needs call A's output. "Read one file first, then decide" is the anti-pattern — request what you need at once.
2. **Trim tool output.** Pipe through `head`, `wc -l`, `grep -c`, `--jq`. For big dumps, write to a file and read slices. A tool result that enters context is re-billed on every later request in the session.
3. **Delegate mechanical exploration.** Judgment stays in the main thread; broad file sweeps go to a cheap-model subagent. Where your runtime has no subagents, keep sweeps out of the main context anyway: use local tools (`grep -l`, `find`, detectors) and read only the slices that matter. Give the child a target, a deliverable, and a stop condition; take back a short summary, never file dumps. Measured on a 20-file sweep at 500K main context: done inline ≈ $10 plus 60K tokens of permanent context; delegated ≈ $0.08 plus a 2K summary. Same judgment quality — the judging still happens in main.
4. **Never poll.** Waiting is free; polling is not (one status check at 468K context ≈ $0.23). Run long commands in the background and let completion notify you, use blocking waits (`gh run watch`, not repeated `gh pr checks`), or check once at the expected finish time. Not sixteen 30-second pokes at an 8-minute CI run.
5. **Session hygiene.** Unrelated new task → suggest clearing context (cost: zero). Idle past the prompt-cache TTL → prefer wrapping up over resuming; a cache miss reprocesses everything at roughly 10× the cached rate.

## The shape to remember
Cache reads look cheap per token (~1/10 of input) but they multiply by every call. A large context taxes every subsequent action — the tax compounds. Keeping context small is worth more than any single-call saving.
