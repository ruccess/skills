---
name: context-thrift
description: Use when the user asks to reduce agent token cost, or when a task requires broad repository exploration, large tool outputs, or long-running checks. Do not invoke for a short answer or a single bounded read.
---

# context-thrift — Spend context like money

## Core
Model round trips may process retained conversation context again. Cost depends on billable input, cache hits and writes, output, model pricing, and runtime compaction. A tool call is not necessarily a separate model round trip: several calls can share one response. Reduce unnecessary round trips and retained output, then verify savings from actual usage.

Historical author observation from one session (`bunx ccusage`): 855 tool calls across 854 messages, about 400M cache-read tokens, and 62% of reported cost attributed to cache reads. This is a workload-specific observation, not a forecast. Three independent calls in one response can avoid two model round trips; it does not guarantee a two-thirds reduction in total cost.

## Rules

1. **Batch independent calls.** Put every independent read, grep, and check into ONE message. Go sequential only when call B needs call A's output. "Read one file first, then decide" is the anti-pattern — request what you need at once.
2. **Trim tool output.** Pipe through `head`, `wc -l`, `grep -c`, `--jq`. For big dumps, write to a file and read slices. Retained output may contribute to later billable input until the runtime truncates or compacts it.
3. **Delegate selectively.** Use a lower-cost subagent for a bounded, independent sweep when permitted and when its startup and coordination cost are justified. Give it a target, deliverable, and stop condition; request a short evidence summary. Otherwise use local search and read only relevant slices. Judge answer quality and total usage across parent and children; delegation does not guarantee equal quality or lower cost.
4. **Avoid repeated unchanged status checks.** Prefer completion notifications or bounded waits. If polling is the only mechanism, back off while state is unchanged and respect the runtime's responsiveness requirements. Waiting may still incur infrastructure charges.
5. **Session hygiene.** For unrelated work, consider a fresh context with only the necessary handoff. Preserve decisions needed for unfinished work; do not abandon a task because a cache entry may have expired. Cache lifetime and discounts depend on the provider and model.

## The shape to remember
Measure task quality, total input/output/cache usage, elapsed time, and cost together. Batching and smaller context are techniques to test, not fixed savings guarantees.
