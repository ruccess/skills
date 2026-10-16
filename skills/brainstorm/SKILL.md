---
name: brainstorm
description: Use when a feature or behavior change has unresolved requirements or design choices. Do not invoke for an already approved design or a concrete change with no material ambiguity.
---

# brainstorm — Idea to approved design

## Hard gate
Do not implement while an unresolved requirement or design choice would materially change correctness, scope, or an irreversible decision. Reuse agreements already present in the conversation, issue, spec, or approved design without asking for approval again. If those sources make the requested behavior concrete, skip brainstorming and continue to planning or implementation.

## Process
1. **Recover existing agreement**: identify settled goals, constraints, boundaries, and success criteria from current context. Do not reopen them unless new evidence creates a contradiction.
2. **Explore context**: files, docs, recent commits. Never ask what the codebase can answer.
3. **Find material gaps**: if the request bundles independent subsystems, identify their boundaries and dependencies. Ask only about choices whose answer can change correctness, scope, user intent, or a hard-to-reverse design. Prefer one focused multiple-choice question at a time, with a recommendation.
4. **Compare real alternatives**: when a material choice genuinely has multiple viable approaches, present 2–3 with trade-offs and a recommendation. Do not manufacture alternatives for a concrete change.
5. **Present the changed design**: scale detail to risk. Seek approval for new or changed material choices; existing approval carries forward.
6. **Record when useful**: write a short design doc when repository rules require one or complexity, handoff, or durable rationale makes it valuable. Do not create a document solely as a gate.

## Done when
No material design assumption remains unresolved, and any new or changed design has user approval. Use `/dev-plan` when a written breakdown or isolated workspace is needed; otherwise a concrete agreed change may proceed to `/dev-build`.

---
Distilled from [obra/superpowers](https://github.com/obra/superpowers) `brainstorming`.
