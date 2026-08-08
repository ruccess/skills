---
name: dev-plan
description: Use when starting a new development task — before any code is written, when requirements are still fuzzy, or when an isolated workspace and a written plan are needed.
---

# dev-plan — Start a task

## Core
Plan before code. The deliverables are a plan document and an isolated workspace.

## Steps
1. **Confirm requirements**: pin down goal, scope, and done-criteria with the user. If anything is ambiguous, ask — do not implement.
2. **Load project rules**: read the target repository's AGENTS.md / CLAUDE.md / CONTRIBUTING. Repo-specific rules (branching, commits, verification commands) override this skill.
3. **Isolate the workspace**: if the project ships its own task-start script or skill, follow it. Otherwise create a git worktree or a new branch.
4. **Write the plan**: implementation steps, risks, and how each step will be verified. Every step must be independently verifiable.
5. **Grill the plan**: before finalizing, interrogate assumptions, alternatives, and decision branches with the user until shared understanding. Use a grilling skill (grill-me, grill-with-docs) when available.

## Done when
A plan document exists and the workspace is ready. Next: `/dev-build`
