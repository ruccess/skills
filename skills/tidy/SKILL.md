---
name: tidy
description: Use when implementation works and the code needs hygiene before review or ship — unused code, leftover debug output, misplaced files, naming drift. Behavior-preserving changes only.
---

# tidy — Code hygiene, behavior preserved

## Core
Tidying is separate from building. Never mix behavior changes with structural cleanup — if a "tidy" would change behavior, stop: that is a code change, not a tidy. (After Kent Beck's *Tidy First?*.)

## Checklist (run all, in order)

1. **Dead code**: unused exports, functions, variables, imports; unreachable branches; commented-out code. Use detectors when the project has them (`knip`, `depcheck`, `ts-prune`, `eslint` unused rules — or the language's equivalents).
2. **Leftovers**: debug prints (`console.log`, `print`, `dd`), `.only`/`.skip` in tests, temporary files, TODO/FIXME added during this task — resolve them or file them as issues.
3. **File placement**: every new file lives where the project's structure says it should — by feature/domain, tests in the project's test layout. Check how neighboring files are organized before inventing a location.
4. **Naming drift**: names still match what the thing now does after the changes; boolean `is/has/should/can` prefixes; casing consistent with the codebase.
5. **Size and shape**: functions grown past ~50 lines or nesting past 4 levels → extract or use early returns. Files far past project norms → split.
6. **Prove preservation**: re-run the project's tests after tidying. Same green as before — no more, no less.

## Commits
Tidy commits stay separate from feature commits: `refactor:` or `chore:`, never bundled.

## Not tidy — report, don't do
Bug fixes, performance changes, new abstractions "while we're at it", API or signature changes. List them for the user instead.
