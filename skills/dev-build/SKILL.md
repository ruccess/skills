---
name: dev-build
description: Use when implementing a planned task — a plan document exists and code needs to be written, tested, and verified step by step.
---

# dev-build — Implement

## Gate
No plan document → do not implement. Go back to `/dev-plan`.

## Steps
1. If the project has its own execution loop (skill or harness), follow it.
2. Otherwise use failing test → minimal implementation → refactor for testable behavior changes. For documents or configuration, choose checks that verify the changed artifact and its consumers; do not invent a unit test merely to satisfy the loop. Respect any repository-mandated checks. Group commits by coherent, reviewable change, following repository rules and user instructions.
3. Run the applicable verification commands after each meaningful implementation step. Resolve relevant failures before dependent work; repeat a passing check only when later changes affect its inputs or repository policy requires it.
4. If the work drifts from the plan, stop and update the plan first, then continue.
5. **Tidy**: finish with the `tidy` checklist — behavior-preserving hygiene (dead code, leftovers, file placement, naming, comment accuracy) — then re-run verification. Load it as a skill where supported, otherwise follow `skills/tidy/SKILL.md` inline. Run it against this task's own diff first: every function, file, and dependency you added needs a call site, and every comment you wrote or passed over must still match the code. What you created this session is exactly what no detector and no reviewer knows to look for.

## Done when
All plan steps are implemented, applicable checks pass, and the changes are tidied. Next: `/dev-ship` only when the user requested a PR or the agreed delivery plan includes one; otherwise report completion within the requested scope.
