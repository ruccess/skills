---
name: grill
description: Use when a plan or design needs stress-testing before it is finalized — interrogating assumptions branch by branch against the project's code, terminology, and documented decisions.
---

# grill — Interrogate the plan

## Core
Stress-test a proposed plan or design for material correctness, boundary, dependency, and failure-mode risks before it is finalized. Preserve settled decisions unless evidence contradicts them. This is a focused design review, not open-ended joint exploration or a requirement to force every possible decision; use `thinker` to explain together, explore hypotheses and alternatives, or end with questions still open.

**Scale to the change**: a small, low-risk change may need no grill. When invoked, examine only the branches that carry real risk.

## Rules
1. **Fix the review target**: state the plan or design being tested and carry forward its agreed constraints. Do not reopen them without contrary evidence.
2. **Explore before asking**: inspect relevant code, docs, glossary, and decisions. If they answer a question, use that evidence instead of asking the user.
3. **Identify consequential risks**: focus on assumptions about public behavior, failure handling, data boundaries, real blocking dependencies, and hard-to-reverse choices. Avoid hypothetical branches with no plausible effect on the implementation.
4. **Stress with scenarios**: use concrete success, edge, and failure cases to test whether the proposed boundaries and acceptance criteria hold. Cross-reference code immediately when it contradicts a claim.
5. **Ask only blockers**: ask one focused question at a time only when an unresolved answer materially affects correctness or scope and available evidence cannot resolve it. Include a recommendation and trade-off. Record lower-impact uncertainty as a residual risk instead of forcing a decision.
6. **Update proportionally**: revise the existing plan or design when the review changes it. Add glossary or ADR documentation only when repository policy requires it or the decision has durable value; an ADR still needs to be hard to reverse, surprising without context, and based on a real trade-off. Apply the repository's document checks to files actually changed.

## Done when
Material correctness and scope risks are resolved or explicitly block implementation, the reviewed plan reflects resulting changes, and any touched documents pass their applicable checks.

---
Distilled from the `grill-with-docs` skill.
