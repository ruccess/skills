---
name: dev-ship
description: Use when implementation is complete and the user requests a pull request or the agreed delivery plan includes one. Do not invoke for evaluation, review-only, or push-only requests.
---

# dev-ship — Finalize and draft PR

## Core
"Implemented" and "shippable" are different things. Eight gates, in order, before a PR exists.

**After a gate has already run**, fix failures and re-run only affected checks. This table never skips initial checks or applies outside an authorized PR workflow:

| The fix changed | Re-check affected evidence |
|---|---|
| Source code | 2 tidy, 3 review, 5 verify, 6 spec check |
| Documents only (ADR, README) | 4 docs and applicable gate 5 checks, including changed links or documentation builds |
| Config, CI, metadata | 5 verify and any affected review, requirements, or governance evidence |

Treat the table as defaults: changed requirements or plans require gate 6 again; security-sensitive configuration requires gate 3; changed governance evidence requires gate 7. Then continue forward from where you stopped. Reuse evidence only while its inputs remain unchanged.

**Repeated failure without new evidence**: after two attempts at the same unresolved cause, report the gate, attempts, and blocker. Continue only with a materially different, evidence-backed approach within the authorized scope; do not repeat the same failed action.

## Change size (state before step 2)
Report three numbers from step 1 before doing anything else: files changed, lines changed, and whether the diff touches migrations, schemas, or a public API signature.

The fast path — steps 1, 2, 5, 7, 8 — is available when **all** hold: 1–2 files, under 100 changed lines, no migrations/schema/public API changes, and no authentication, authorization, secrets, dependencies, deployment, CI, or runtime configuration changes. Unknown impact requires the full path. The user's label "simple" or "quick" is not evidence of low risk. Gate 4 also runs when the diff contains Korean documents not already reviewed; gate 6 also runs whenever the task has a plan document with a traceability table. Repository-required reviews and checks still run through gate 7.

## Steps (fixed order)
1. **Survey changes**: resolve the base from the existing PR or agreed target branch, otherwise inspect repository promotion rules and the remote default branch; ask only if the target remains ambiguous. Inspect `git diff <base>...HEAD`, staged and unstaged diffs, and untracked files. Identify this task's changes and preserve unrelated work; never discard, stash, or commit it merely to get a clean tree.
2. **Cleanup**: apply the `tidy` checklist — behavior-preserving hygiene only, no new features. Load it as a skill where your runtime supports skills; otherwise follow `skills/tidy/SKILL.md` inline. Skip if nothing changed since the last tidy pass.
3. **Review**: run code review — language-specific reviewer agents in parallel where your runtime supports subagents, otherwise an inline review pass. Fix CRITICAL and HIGH; report MEDIUM and below as a list. If fixes were made here, re-apply the tidy checklist to the fixed code.
4. **Docs check**: if the diff contains Korean documents not already reviewed during `grill`, run the `korean-docs` review pipeline on them.
5. **Verify**: run the project's test and lint commands. On failure, stop here — no PR.
6. **Spec check**: locate the task's plan document (from `dev-plan`). If none exists, skip and say so. Otherwise: (a) if the requirements source records a version or last-edited timestamp, compare it with the one stamped in the traceability table — when it moved, read what changed and re-judge the affected rows before continuing; (b) mark every traceability row satisfied / unsatisfied / out-of-scope, naming the code or test that proves each satisfied row — no row may stay unmarked; (c) an out-of-scope row must cite an existing agreed scope boundary or an explicit user-approved scope change. Missing implementation is not evidence of exclusion: without that agreement, mark the row unsatisfied; (d) an unsatisfied row stops the run unless the user explicitly accepts it as a known gap, named as such in the PR body. The completed table, including exclusion evidence, goes into the PR body at gate 8.
7. **Governance**: if the project defines governance artifacts — change checklists, security-review triggers, ADR requirements, compliance hooks — confirm each one is satisfied and say so explicitly. If any item is unsatisfied, stop here and resolve it first; this gate is as hard as verification.
8. **Draft PR**: follow the target repository's commit/branch/PR rules. Report title, body summary, and base branch in one line, then `gh pr create --draft` (GitHub; on other platforms use the draft equivalent, e.g. `glab mr create --draft`). Draft is the only default — never a ready-for-review PR.

## Never
- Create a PR with failing verification — "CI will catch it" is not a reason
- Skip review outside the verified fast path, or skip a repository-required review
- Default to a non-draft PR
- Claim "tests passed" in the PR body without having run them
- Mark a traceability row satisfied without naming the code or test that proves it

## Required closing report
End every run — shipped, stopped, or fast-pathed — with one line per gate. Nothing else proves a gate ran, and a gate nobody can see is a gate nobody runs.

```
변경 규모: 파일 N개, N줄, 마이그레이션/스키마/API 접촉 여부
1 서베이  통과
2 정리    통과 | 스킵(직전 tidy 이후 변경 없음)
3 리뷰    통과(HIGH 1건 수정) | 스킵(fast path)
4 문서    스킵(한국어 문서 없음)
5 검증    통과(`npm test`) | 정지(2 failed)
6 스펙대조 통과(추적표 12행 전부 판정) | 스킵(계획 문서 없음) | 정지(미충족 2건)
7 거버넌스 통과(체크리스트 3항목) | 정지(ADR 없음)
8 PR      https://... (draft) | 미생성
```

Name the command or artifact behind each verdict. "통과" with nothing after it is not a report. A skipped gate states its reason.

## Done when
The closing report is printed and, if a PR was created, its draft URL appears in line 8.
