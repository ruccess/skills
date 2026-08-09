---
name: korean-docs
description: Use when producing or revising Korean documents others will read — ADRs, plans, proposals, incident reports, README, any .md deliverable — and when reviewing such documents before commit.
---

# korean-docs — Korean document writing and review

## Core
Documents are complete prose — different from korean-chat's lead-plus-bullets shape. Review with the korean-skills pipeline before commit.

## Writing rules
- Structure: conclusion/summary section first, evidence and detail after. Section titles are noun phrases
- Style: declarative complete sentences ("~한다/~이다"). 개조식 only inside lists and tables
- Sentence rules are the same as korean-chat: no translationese (attach particles directly), no double passives, no "가지고 있다", no AI cliché vocabulary (핵심적·효과적·혁신적·원천적으로), minimal commas
- No unsupported qualifiers. Numbers, paths, and commands are concrete

## Review pipeline (before commit)
Target: Korean .md deliverables others will read. Steps are order-dependent — run sequentially.

1. **humanizer** — apply the `humanizer` skill from [DaleSeo/korean-skills](https://github.com/DaleSeo/korean-skills) to the file. Delegate to a cheap-model subagent where your runtime supports subagents; otherwise run the review in the main context. If the change rate exceeds 30%, report instead of applying
2. **grammar-checker** — spelling and spacing via korean-skills `grammar-checker`
3. **style-guide** — only for long documents (300+ lines) or multi-author documents; skip by default

When delegating, the main context receives only a diff summary — do not read the reference files in the main thread.

Requires: the DaleSeo/korean-skills plugin (or a local checkout of that repository).

## Exceptions
- Code blocks, commands, quotes, and proper nouns stay verbatim
- English documents are out of scope
