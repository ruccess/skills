---
name: brainstorm
description: Use when a feature or behavior change has unresolved requirements or design choices. Do not invoke for an already approved design or a concrete change with no material ambiguity.
---

# brainstorm — Idea to approved design

## Hard gate
While material requirements or design choices remain unresolved, do not implement or scaffold. Resolve those choices and obtain approval for the resulting design. Existing approval remains valid: inspect the agreed design and proceed within its scope without asking for approval again. A small change needs questions only when an unresolved choice affects correctness or the user's intent.

## Process
1. **Scope check first**: if the request bundles multiple independent subsystems, identify their boundaries and dependencies, then refine unresolved choices without dropping any requested subsystem.
2. **Explore context**: files, docs, recent commits. Never ask what the codebase can answer.
3. **One question at a time**: purpose, constraints, success criteria. Prefer multiple choice. Never dump a questionnaire.
4. **Propose 2–3 approaches**: with trade-offs and your recommendation.
5. **Present the design**: in sections scaled to complexity; revise until the user approves.
6. **Record it**: save a short design doc where the project keeps its docs.

## Done when
The user approved the design. Next: `/dev-plan`.

---
Distilled from [obra/superpowers](https://github.com/obra/superpowers) `brainstorming`.
