---
name: dev-ship
description: Use when a task's implementation is complete and the work needs to leave the branch as a pull request.
---

# dev-ship — Finalize and draft PR

## Core
"Implemented" and "shippable" are different things. Seven gates, in order, before a PR exists. If any gate fails: fix the issue, then resume from step 2 — later gates must see the fix.

**Fast path**: for a small, low-risk change (single file, tens of lines, no schema or API impact), steps 2 (tidy), 5 (verify), and 7 (draft PR) suffice — state that you are taking the fast path and why.

## Steps (fixed order)
1. **Survey changes**: `git diff <base>...HEAD` for the full change set; clean up uncommitted changes.
2. **Cleanup**: apply the `tidy` checklist — behavior-preserving hygiene only, no new features. Load it as a skill where your runtime supports skills; otherwise follow `skills/tidy/SKILL.md` inline. Skip if nothing changed since the last tidy pass.
3. **Review**: run code review — language-specific reviewer agents in parallel where your runtime supports subagents, otherwise an inline review pass. Fix CRITICAL and HIGH; report MEDIUM and below as a list. If fixes were made here, re-apply the tidy checklist to the fixed code.
4. **Docs check**: if the diff contains Korean documents not already reviewed during `grill`, run the `korean-docs` review pipeline on them.
5. **Verify**: run the project's test and lint commands. On failure, stop here — no PR.
6. **Governance**: if the project defines governance artifacts — change checklists, security-review triggers, ADR requirements, compliance hooks — confirm each one is satisfied and say so explicitly. If any item is unsatisfied, stop here and resolve it first; this gate is as hard as verification.
7. **Draft PR**: follow the target repository's commit/branch/PR rules. Report title, body summary, and base branch in one line, then `gh pr create --draft` (GitHub; on other platforms use the draft equivalent, e.g. `glab mr create --draft`). Draft is the only default — never a ready-for-review PR.

## Never
- Create a PR with failing verification — "CI will catch it" is not a reason
- Skip review — "it's a small change" is not a reason
- Default to a non-draft PR
- Claim "tests passed" in the PR body without having run them

## Done when
Draft PR URL reported, plus the list of remaining MEDIUM-and-below issues.
