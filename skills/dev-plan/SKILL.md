---
name: dev-plan
description: Use when starting a new development task whose requirements are agreed (or whose brainstorm design is approved) and the work still needs a written plan and an isolated workspace. For a still-fuzzy idea with no agreed design, use brainstorm first.
---

# dev-plan — Start a task

## Core
Plan before code. The deliverables are a plan document and an isolated workspace. If the idea itself is still fuzzy — no agreed design yet — run the `brainstorm` skill first.

## Steps
1. **Confirm requirements**: pin down goal, scope, and done-criteria with the user. If a `brainstorm` design was already approved, carry its scope over verbatim — do not re-ask what was decided there. If anything is still ambiguous, ask — do not implement.
2. **Load project rules**: read the target repository's AGENTS.md / CLAUDE.md / CONTRIBUTING. Repo-specific rules (branching, commits, verification commands) override this skill.
3. **Isolate the workspace**: if the project ships its own task-start script or skill, follow it. Otherwise create a git worktree or a new branch.
4. **Write the plan**: implementation steps, risks, and how each step will be verified. Every step must be independently verifiable.
5. **Grill the plan**: before finalizing, run `grill` — load it as a skill where supported, otherwise follow `skills/grill/SKILL.md` inline — interrogating assumptions, alternatives, and decision branches with the user until shared understanding.

## Done when
A plan document exists and the workspace is ready. Next: `/dev-build`
