---
name: dev-build
description: Use when implementing a planned task — a plan document exists and code needs to be written, tested, and verified step by step.
---

# dev-build — Implement

## Gate
No plan document → do not implement. Go back to `/dev-plan`.

## Steps
1. If the project has its own execution loop (skill or harness), follow it.
2. Otherwise run the TDD loop: failing test → minimal implementation → refactor. Commit per plan step.
3. Run the project's verification commands (tests, lint) after each step. Never carry a failure into the next step.
4. If the work drifts from the plan, stop and update the plan first, then continue.
5. **Tidy**: finish with the `tidy` checklist — behavior-preserving hygiene (dead code, leftovers, file placement, naming, comment accuracy) — then re-run verification. Load it as a skill where supported, otherwise follow `skills/tidy/SKILL.md` inline. Run it against this task's own diff first: every function, file, and dependency you added needs a call site, and every comment you wrote or passed over must still match the code. What you created this session is exactly what no detector and no reviewer knows to look for.

## Done when
All plan steps are implemented, tests pass, and the code is tidied. Next: `/dev-ship`
