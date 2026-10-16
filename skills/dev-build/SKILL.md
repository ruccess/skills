---
name: dev-build
description: Use when implementing an agreed change in code, configuration, or documentation and verifying it in small reviewable steps.
---

# dev-build — Implement

## Gate
Implementation needs an agreed scope in the conversation, issue, spec, or plan. Do not stop merely because no separate plan file exists: a concrete agreed bug fix can proceed, including when the user explicitly asked not to create one. Write a plan when repository rules require it or the change is complex enough that sequencing, traceability, or handoff would otherwise be unclear. If a material correctness or scope assumption is unresolved, ask before changing code.

## Steps
1. Load repository instructions and inspect the starting diff so existing user changes are identified and preserved. If the project has its own execution loop, use it.
2. For a testable behavior change, choose a stable public seam and an expected result known independently from the implementation: a spec example, a worked case, or a fixed literal. Test behavior through that seam. Do not test private methods, mock internal collaborators, or calculate the expected value with the same logic under test. Example: assert that the public price parser returns the spec's literal `1250` for `"$12.50"`; do not assert that a private helper matches a duplicate parsing formula. A checkout test should assert the public receipt, not mock its internal pricing collaborator merely to assert that it was called. Mock an external boundary only when needed to observe the public contract.
3. Work one slice at a time: write one focused failing behavior test, see it fail for the expected reason, add the minimum implementation that passes it, then move to the next test. Do not write a batch of imagined tests or speculative implementation ahead of the current slice.
4. For documentation, configuration, generated artifacts, or changes without a useful automated seam, run checks appropriate to the artifact and its consumers instead of inventing a unit test. Respect all repository-mandated checks.
5. Run affected verification after each meaningful slice. Resolve relevant failures before dependent work; repeat a passing check only when later changes affect its inputs or repository policy requires it. Group commits by coherent, reviewable change, following repository rules and user instructions.
6. If implementation evidence contradicts the agreement, stop before expanding scope. Resolve the material decision and update the existing issue, spec, or plan when it is the recorded source; do not create documentation solely to satisfy this workflow.
7. **Tidy**: apply the `tidy` skill to this task's own diff; its evidence and preservation rules govern cleanup decisions. Load it as a skill where supported, otherwise follow `skills/tidy/SKILL.md` inline. Re-run checks affected by cleanup edits; preserve unrelated user changes and uncertain usage or intent, reporting them instead of forcing a change.

## Done when
All agreed slices are implemented, their observable behavior is supported by applicable evidence, required checks pass, and this task's diff is tidied without disturbing user changes. Next: `/dev-ship` only when the user requested a PR or the agreed delivery plan includes one; otherwise report completion within the requested scope.

---
Selectively adapted, not copied, from Matt Pocock's [`tdd`](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/tdd/SKILL.md).
