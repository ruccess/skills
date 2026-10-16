---
name: dev-ship
description: Use when implementation is complete and the user requests a pull request or the agreed delivery plan includes one. Do not invoke for evaluation, review-only, or push-only requests.
---

# dev-ship — Finalize and draft PR

## Core
Prepare a reviewable Draft PR for the agreed change, with evidence that it meets the requirements and the repository's delivery rules. Review depth follows the actual impact; a gate count or file-count threshold is not a substitute for judgment.

Reuse completed cleanup, review, and verification while their inputs remain unchanged. Establish missing evidence before publishing, and re-check evidence affected by a fix:

| The fix changed | Re-check affected evidence |
|---|---|
| Source code | Cleanup, standards and requirements reviews, affected verification |
| Documents only (ADR, README) | Document review and applicable link or documentation-build checks |
| Config, CI, metadata | Consumers of the configuration and affected review or governance requirements |

The table is a starting point. A changed requirement invalidates its requirements review even if code is untouched; changed security or governance evidence needs its own review. Name the input or command behind reused evidence instead of treating an old green result as current proof.

**Repeated failure without new evidence**: after two attempts at the same unresolved cause, report the attempts and blocker. Continue only with a materially different, evidence-backed approach within the authorized scope.

## Review depth
Inspect behavior and consumers: migrations, schemas, public contracts, authentication, authorization, secrets, dependencies, deployment, CI, and runtime configuration may carry risk even in a one-line change. Unknown impact calls for investigation. The user's label "simple" is not evidence of low risk.

Keep a clear, low-impact review brief and inline. Use separate review contexts when complexity, uncertainty, or repository policy warrants them. Both review perspectives still apply; repository-required reviews and checks are never optional. Do not repeat completed work just to produce a checklist.

## Prepare the change
1. **Survey changes**: resolve the base from the existing PR or agreed target branch, otherwise inspect repository promotion rules and the remote default branch; ask only if the target remains ambiguous. Inspect `git diff <base>...HEAD`, staged and unstaged diffs, and untracked files. Identify this task's changes and preserve unrelated work; never discard, stash, or commit it merely to get a clean tree.
2. **Cleanup**: apply `tidy` to this task's changes only when cleanup has not already covered the current diff. Its preservation rules govern what may change. Load the skill where supported; otherwise follow `skills/tidy/SKILL.md` inline.
3. **Review two perspectives**: review **standards** against the repository's documented rules, and **requirements** against the originating conversation, issue, spec, or plan. Keep findings separate so clean code cannot conceal missing behavior. Cite the violated rule or requirement and the relevant diff; label a design concern as a judgment call, not a hard violation. Skip checks already enforced by tooling. Fix CRITICAL and HIGH defects within scope, report remaining findings, and re-check affected evidence after fixes.
4. **Docs check**: if the diff contains Korean documents not already reviewed during `grill`, run the `korean-docs` review pipeline on them.
5. **Verify**: establish current results for the project's required tests, lint, type checks, and other applicable checks. Reuse valid results as above; a failed required check blocks publication. Distinguish local verification from CI, deployment, and runtime observations.
6. **Check requirement coverage**: review all source items, including notes, pending items, and appended sections, even without a plan file. When a traceability table exists, compare any recorded source version or last-edited timestamp and re-judge changed items. Mark every row satisfied / unsatisfied / out-of-scope, naming code or tests as proof. Exclusion needs an existing agreed scope boundary or explicit user-approved scope change; missing code is not exclusion evidence. Unsatisfied requirements block publication unless the user explicitly accepts the named gap. Include the completed table and any exclusion evidence in the PR when one exists.
7. **Honor governance**: confirm required checklists, security reviews, ADRs, and other repository delivery rules. An unmet requirement blocks publication; report the missing artifact and practical next step.

## Write and publish the Draft PR
Follow the repository template and branch/commit/PR rules. Scale the body to the change:
- **Change**: the concrete problem and resulting behavior. Use a small before/after example; a diagram or diff sketch is useful only when it explains the change faster.
- **Evidence**: actual before/after observations, regression test results, screenshots, or command output. Keep unrun or unavailable checks explicit; never invent a failing baseline. A PR attempt does not prove CI or deployment succeeded.
- **Impact**: affected consumers, material risks, and how the change can be reverted or why reversal is difficult. Apply repository rollback requirements; avoid empty risk boilerplate.

Report the proposed title, concise body summary, and base before publishing; this is not an extra approval request when PR creation is already authorized. Create with `gh pr create --draft` on GitHub or the platform's draft equivalent. Attach the created PR to the task when the environment provides that capability.

## Never
- Create a PR with failing verification — "CI will catch it" is not a reason
- Skip requirements review because a plan file is absent, or bypass repository-required review
- Default to a non-draft PR
- Claim "tests passed" in the PR body without having run them
- Mark a traceability row satisfied without naming the code or test that proves it

## Closing report
Lead with the Draft PR URL or the concrete blocker. Briefly explain changed behavior, verification evidence, and remaining gaps or risks. Name the command or artifact supporting a claim, and the reason for a material omission. Separate standards findings from requirements gaps when either remains. Do not print empty per-gate status rows or file/line counts unless requested or useful to explain impact.

## Done when
The authorized Draft PR exists with accurate evidence, or a concrete blocker and the work already completed are reported. No required check, source requirement, or repository rule has been silently dropped.

---
Selected adaptations of Matt Pocock's [code-review](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/code-review/SKILL.md) and [pr](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/pr/SKILL.md); workflow name and repository-specific delivery rules retained.
