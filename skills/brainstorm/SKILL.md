---
name: brainstorm
description: Use before any creative work — a new feature, component, or behavior change — while the idea is still fuzzy and no design has been agreed. Also when a request bundles multiple independent subsystems.
---

# brainstorm — Idea to approved design

## Hard gate
No implementation action — no code, no scaffolding, no implementation skill — until a design has been presented and the user has approved it. "Too simple to need a design" is the trap: simple projects are where unexamined assumptions waste the most work. A simple project just gets a short design.

## Process
1. **Scope check first**: if the request bundles multiple independent subsystems, decompose before refining details — then brainstorm only the first sub-project.
2. **Explore context**: files, docs, recent commits. Never ask what the codebase can answer.
3. **One question at a time**: purpose, constraints, success criteria. Prefer multiple choice. Never dump a questionnaire.
4. **Propose 2–3 approaches**: with trade-offs and your recommendation.
5. **Present the design**: in sections scaled to complexity; revise until the user approves.
6. **Record it**: save a short design doc where the project keeps its docs.

## Done when
The user approved the design. Next: `/dev-plan`.

---
Distilled from [obra/superpowers](https://github.com/obra/superpowers) `brainstorming`.
