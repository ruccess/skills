---
name: grill
description: Use when a plan or design needs stress-testing before it is finalized — interrogating assumptions branch by branch against the project's code, terminology, and documented decisions.
---

# grill — Interrogate the plan

## Core
Interview the user relentlessly until shared understanding: walk every branch of the decision tree, one question at a time, each question carrying your recommended answer. Stop only when no unresolved branch remains.

**Scale to the change**: for a small, low-risk change (single file, tens of lines), resolve only the one or two branches that carry real risk — do not walk the full tree.

## Rules
1. **One question, one answer**: wait for the reply before the next question. Attach your recommendation to every question. Never dump a review essay with questions at the end.
2. **Explore before asking**: if the codebase or the docs can answer a question, read them instead of asking it.
3. **Challenge terminology**: when a term conflicts with the project glossary (CONTEXT.md), call it out. Sharpen fuzzy words into canonical terms — "'account' — do you mean Customer or User?"
4. **Stress with scenarios**: invent concrete edge cases that force precise boundaries between concepts.
5. **Cross-reference code**: when a claim contradicts what the code actually does, surface the contradiction immediately.
6. **Persist decisions inline**: write resolved terms into CONTEXT.md as they happen — glossary only, no implementation detail. Offer an ADR only when the decision is hard to reverse AND surprising without context AND the result of a real trade-off; skip it if any of the three is missing.
7. **Polish at the end**: if the session created or updated Korean documents (CONTEXT.md entries, ADRs, the plan itself), finish by running the `korean-docs` review pipeline over them.

## Done when
Every branch is resolved, the plan reflects each decision, and touched Korean documents passed the korean-docs pipeline. Called by `/dev-plan` step 5.

---
Distilled from the `grill-with-docs` skill.
