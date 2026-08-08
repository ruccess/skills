---
name: dev-ship
description: Use when a task's implementation is complete and the work needs finalizing — cleanup, review, docs check, verification, and a draft pull request.
---

# dev-ship — Finalize and draft PR

## Core
"Implemented" and "shippable" are different things. Six gates, in order, before a PR exists.

## Steps (fixed order)
1. **Survey changes**: `git diff <base>...HEAD` for the full change set; clean up uncommitted changes.
2. **Cleanup**: behavior-preserving only — simplify, remove dead code, fix naming. No new features.
3. **Review**: run code review (language-specific reviewer agents in parallel when available). Fix CRITICAL and HIGH; report MEDIUM and below as a list.
4. **Docs check**: if the diff contains Korean documents, run the `korean-docs` review pipeline (included in this suite).
5. **Verify**: run the project's test and lint commands. On failure, stop here — no PR.
6. **Draft PR**: follow the target repository's commit/branch/PR rules. Report title, body summary, and base branch in one line, then `gh pr create --draft`.

## Never
- Create a PR with failing verification — "CI will catch it" is not a reason
- Skip review — "it's a small change" is not a reason
- Default to a non-draft PR
- Claim "tests passed" in the PR body without having run them

## Done when
Draft PR URL reported, plus the list of remaining MEDIUM-and-below issues.
