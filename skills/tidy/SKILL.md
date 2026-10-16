---
name: tidy
description: Use when implementation works and the current task's changes need cleanup before review or delivery. Do not invoke for repository-wide refactoring, bug fixes, or performance work.
---

# tidy — Code hygiene, behavior preserved

## Core
Tidying is separate from building. Never mix behavior changes with structural cleanup — if a "tidy" would change behavior, stop: that is a code change, not a tidy. (After Kent Beck's *Tidy First?*.)

Start with this task's diff and inspect surrounding code only to establish usage or intent. Apply the smallest cleanup supported by evidence; a checklist finding is not a requirement to edit. Preserve unrelated user changes and report out-of-scope findings without expanding the task.

## Checklist (inspect relevant items)

1. **Dead code**: check new functions, exports, imports, files, and dependencies for actual usage. Use the project's detectors when available, but treat search results and detector warnings as candidates, not proof. Before deletion, check relevant dynamic loading, framework registration, package exports, external consumers, and import side effects. Remove demonstrably abandoned task-local code; preserve and report uncertain cases.
2. **Leftovers**: remove confirmed accidental task-local debug output, temporary files, and test `.only`. Inspect intent before changing `.skip`, TODO/FIXME, or logs: preserve documented quarantines, planned work, and operational or audit logging. Do not create external issues unless authorized; report unresolved findings instead.
3. **File placement**: every new file lives where the project's structure says it should — by feature/domain, tests in the project's test layout. Check how neighboring files are organized before inventing a location.
4. **Naming drift**: names should match their current role and follow project conventions. Rename only when clarity improves without changing public names, serialization, or reflection-based lookup; uncertain compatibility is not a tidy.
5. **Comment accuracy**: compare conflicting code and comments with requirements, tests, and callers. Correct a comment only when evidence establishes that it is stale. If intent is unresolved or the code may be wrong, preserve both and report the discrepancy; do not conceal a possible bug by making the comment match. Remove redundant comments only when they carry no rationale or contract.
6. **Size and shape**: length and nesting are inspection signals, not extraction thresholds. Keep coherent, readable code intact. Extract or flatten only when it materially improves comprehension within the task's scope and preserves control flow, evaluation order, and side effects; follow project norms.
7. **Verify preservation**: review the cleanup diff for changes to public interfaces, return values, errors, side effects, and execution order. Run the project's applicable checks against affected behavior after editing, reusing a known pre-cleanup baseline. Distinguish existing failures from new ones; report coverage gaps or missing baseline rather than claim equivalence. Green tests alone do not prove preservation, and no-edit reviews need no redundant test run unless repository policy requires one.

## Commits
Tidy commits stay separate from feature commits — never bundled. Use `refactor:` or `chore:` when the repository follows conventional commits; otherwise follow the target repository's own commit convention.

## Not tidy — report, don't do
Bug fixes, performance changes, new abstractions "while we're at it", API or signature changes. List them for the user instead.
