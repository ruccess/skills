---
name: dev-ship
description: Use when a task's implementation is complete and the work needs to leave the branch as a pull request.
---

# dev-ship — Finalize and draft PR

## Core
"Implemented" and "shippable" are different things. Eight gates, in order, before a PR exists.

**When a gate fails**, fix it and re-run only the gates whose inputs the fix touched, not the whole sequence:

| The fix changed | Re-run | Skip |
|---|---|---|
| Source code | 2 tidy, 3 review, 5 verify, 6 spec check | 4 docs |
| Documents only (ADR, README) | 4 docs | 2, 3, 5, 6 |
| Config, CI, metadata | 5 verify | 2, 3, 4, 6 |

Then continue forward from where you stopped. A full restart from step 2 after every fix re-runs review and the docs pipeline on untouched work and exhausts the session before anything gets reported.

**Second failure at the same gate**: stop. Report the gate, both attempts, and what is blocking. Do not try a third time.

## Change size (state before step 2)
Report three numbers from step 1 before doing anything else: files changed, lines changed, and whether the diff touches migrations, schemas, or a public API signature.

The fast path — steps 2, 5, 8 only — is available when **all** hold: 1–2 files, under ~100 lines, and none of migrations/schema/API touched. Otherwise all eight gates run. This is arithmetic on the numbers you just reported, not a judgment call, and the user calling the task "simple" or "quick" does not change the numbers. One addition survives the fast path: gate 6 also runs whenever the task has a plan document with a traceability table.

## Steps (fixed order)
1. **Survey changes**: `git diff <base>...HEAD` for the full change set; clean up uncommitted changes.
2. **Cleanup**: apply the `tidy` checklist — behavior-preserving hygiene only, no new features. Load it as a skill where your runtime supports skills; otherwise follow `skills/tidy/SKILL.md` inline. Skip if nothing changed since the last tidy pass.
3. **Review**: run code review — language-specific reviewer agents in parallel where your runtime supports subagents, otherwise an inline review pass. Fix CRITICAL and HIGH; report MEDIUM and below as a list. If fixes were made here, re-apply the tidy checklist to the fixed code.
4. **Docs check**: if the diff contains Korean documents not already reviewed during `grill`, run the `korean-docs` review pipeline on them.
5. **Verify**: run the project's test and lint commands. On failure, stop here — no PR.
6. **Spec check**: locate the task's plan document (from `dev-plan`). If none exists, skip and say so. Otherwise: (a) if the requirements source records a version or last-edited timestamp, compare it with the one stamped in the traceability table — when it moved, read what changed and re-judge the affected rows before continuing; (b) mark every traceability row satisfied / unsatisfied / out-of-scope, naming the code or test that proves each satisfied row — no row may stay unmarked; (c) an unsatisfied row stops the run unless the user explicitly accepts it as a known gap, named as such in the PR body. The completed table goes into the PR body at gate 8.
7. **Governance**: if the project defines governance artifacts — change checklists, security-review triggers, ADR requirements, compliance hooks — confirm each one is satisfied and say so explicitly. If any item is unsatisfied, stop here and resolve it first; this gate is as hard as verification.
8. **Draft PR**: follow the target repository's commit/branch/PR rules. Report title, body summary, and base branch in one line, then `gh pr create --draft` (GitHub; on other platforms use the draft equivalent, e.g. `glab mr create --draft`). Draft is the only default — never a ready-for-review PR.

## Never
- Create a PR with failing verification — "CI will catch it" is not a reason
- Skip review — "it's a small change" is not a reason
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
