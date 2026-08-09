---
name: dev-ship
description: Use when a task's implementation is complete and the work needs finalizing — cleanup, review, docs check, verification, and a draft pull request.
---

# dev-ship — Finalize and draft PR

## Core
"Implemented" and "shippable" are different things. Seven gates, in order, before a PR exists.

## Steps (fixed order)
1. **Survey changes**: `git diff <base>...HEAD` for the full change set; clean up uncommitted changes.
2. **Cleanup**: run the `tidy` skill — behavior-preserving hygiene only (dead code, leftovers, file placement, naming). No new features.
3. **Review**: run code review (language-specific reviewer agents in parallel when available). Fix CRITICAL and HIGH; report MEDIUM and below as a list.
4. **Docs check**: if the diff contains Korean documents, run the `korean-docs` review pipeline (included in this suite).
5. **Verify**: run the project's test and lint commands. On failure, stop here — no PR.
6. **Governance**: if the project defines governance artifacts — change checklists, security-review triggers, ADR requirements, compliance hooks — confirm each one is satisfied and say so explicitly.
7. **Draft PR**: follow the target repository's commit/branch/PR rules. Report title, body summary, and base branch in one line, then `gh pr create --draft`. Draft is the only default — never a ready-for-review PR.

## Never
- Create a PR with failing verification — "CI will catch it" is not a reason
- Skip review — "it's a small change" is not a reason
- Default to a non-draft PR
- Claim "tests passed" in the PR body without having run them

## Done when
Draft PR URL reported, plus the list of remaining MEDIUM-and-below issues.
