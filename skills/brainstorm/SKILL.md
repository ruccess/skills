---
name: brainstorm
description: Use when a feature or behavior change that is going to be built has unresolved requirements or design choices. Do not invoke for an already approved design, a concrete change with no material ambiguity, or open-ended exploration with nothing to build yet (use thinker).
---

# brainstorm — Idea to approved design

## Gate
Do not implement while a material requirement or design choice is unresolved. A choice is material when different answers would change behavior a user or caller can observe, the shape or persistence of data, a public interface, security or permissions, or work that is costly to undo. A choice that changes none of these is an implementation detail: decide it, state the decision in one line, and continue. A request to skip design does not make a material choice immaterial; name the open choice and ask. For exploration or learning with no change to build, use `thinker`. Reuse agreements already present in the conversation, issue, spec, or approved design without asking for approval again. If those sources make the requested behavior concrete, skip brainstorming and continue to planning or implementation.

## Process
1. **Recover existing agreement**: identify settled goals, constraints, boundaries, and success criteria from current context. Do not reopen them unless new evidence creates a contradiction.
2. **Explore context**: files, docs, recent commits. Never ask what the codebase can answer.
3. **Find material gaps**: if the request bundles independent subsystems, identify their boundaries and dependencies. Ask only about choices whose answer can change correctness, scope, user intent, or a hard-to-reverse design. Prefer one focused multiple-choice question at a time, with a recommendation. Ask about the outcome the user will observe, not the mechanism: storage layout, libraries, delivery services, and similar mechanics are yours to decide or discover unless they change a material outcome, and they do not belong in a list of follow-up questions.
4. **Compare real alternatives**: when a material choice genuinely has multiple viable approaches, present 2–3 with trade-offs and a recommendation. Do not manufacture alternatives for a concrete change.
5. **Present the changed design**: scale detail to risk. Seek approval for new or changed material choices; existing approval carries forward.
6. **Record when useful**: write a short design doc when repository rules require one or complexity, handoff, or durable rationale makes it valuable. Do not create a document solely as a gate.

## Done when
No material design assumption remains unresolved, and any new or changed design has user approval. Use `dev-plan` when a written breakdown or isolated workspace is needed; otherwise a concrete agreed change may proceed to `dev-build`.

---
Distilled from [obra/superpowers](https://github.com/obra/superpowers) `brainstorming` (MIT).
