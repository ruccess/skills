---
name: dev-plan
description: Use when an agreed development task needs a written implementation plan, dependency-aware work breakdown, or isolated workspace before coding.
---

# dev-plan — Start a task

## Core
Turn agreed requirements into a plan of small, independently verifiable user-observable behaviors. Reuse decisions already established in the conversation, issue, spec, or approved design; do not ask for them again. If a material choice still affects correctness or scope, resolve it before implementation. Use `brainstorm` only when the design itself remains genuinely open.

## Steps
1. **Establish the agreement**: collect the goal, scope, constraints, and observable done-criteria from existing context. Ask only about unresolved assumptions that would materially change correctness, scope, or an irreversible decision; batch related questions. Do not reopen agreed choices.
2. **Load project rules**: read the target repository's AGENTS.md / CLAUDE.md / CONTRIBUTING. Repo-specific rules (branching, commits, verification commands) override this skill.
3. **Isolate the workspace**: if the project ships its own task-start script or skill, follow it. Otherwise create a git worktree or a new branch.
4. **Write the plan**: split work into narrow vertical slices, each delivering a complete behavior a user or caller can observe and verify. For each slice state its acceptance evidence, risks, and only the earlier slices that truly block it; do not turn layer order or preferred implementation order into fake dependencies. Keep each slice small enough to implement and review independently. Cross-cutting migrations may use an explicit expand–migrate–contract sequence when no vertical slice can stay valid alone.
5. **Preserve source traceability**: the plan carries two required sections:
   - **Requirements traceability table** — one row per requirement item in the source document (ticket, story, spec), including one-line notes, hold/pending items, appendices, and sections appended at the bottom of the source. Columns: source item (link or anchor), the source's version or last-edited timestamp when it records one, where the plan addresses it, and how `dev-ship` will verify it. The source document stays the single source of truth — this table is a snapshot stamped with when it was taken, never a replacement.
   - **Open questions** — unresolved items found while filling the table. Ask material correctness or scope questions before build; record non-blocking follow-ups without forcing a decision.
6. **Stress-test when warranted**: use `grill` only when the proposed plan has consequential assumptions, failure modes, or disputed trade-offs. A concrete low-risk plan does not require an automatic grill pass.

## Slice example
For "add and remove favorites with a visible list," a slice is **add a favorite from the UI, persist it, and show it in the list after reload**. A second slice removes a favorite through the same path. Each can demonstrate a requested outcome. "Add the table, then endpoints, then UI, then integration tests" is layer-first even when each step has its own tests. Apply this distinction at the highest meaningful boundary of the requested work; a backend-only task need not invent a UI. Enabling schema work may be a prerequisite, but label it as such rather than calling it a completed behavior.

## Done when
A traceable plan exists, every slice has observable acceptance evidence and real blocking edges, material correctness questions are resolved, and the workspace is ready. Next: `/dev-build`.

---
Selectively adapted, not copied, from Matt Pocock's [`to-tickets`](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/to-tickets/SKILL.md).
