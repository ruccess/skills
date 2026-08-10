---
name: korean-docs
description: Use when producing or revising Korean documents others will read — ADRs, plans, proposals, incident reports, README, any .md deliverable — and when reviewing such documents before commit.
---

# korean-docs — Korean document writing and review

## Core
Documents are complete prose — different from korean-chat's lead-plus-bullets shape. Review against the built-in checklist before commit. The korean-skills plugin is an optional precision upgrade, not a requirement.

## Writing rules
- Structure: conclusion/summary section first, evidence and detail after. Section titles are noun phrases
- Style: declarative complete sentences ("~한다/~이다"). 개조식 only inside lists and tables
- Sentence rules are the same as korean-chat: no translationese (attach particles directly), no double passives, no "가지고 있다", no AI cliché vocabulary (핵심적·효과적·혁신적·원천적으로), minimal commas
- No unsupported qualifiers. Numbers, paths, and commands are concrete

## Review (before commit)
Target: Korean .md deliverables others will read. Pick the strongest engine your runtime offers.

1. **korean-skills plugin installed** — run its `humanizer`, then `grammar-checker`, as sequential subagents. Order matters: humanizer rewrites, grammar-checker cleans up after. This is the most precise path. Add `style-guide` only for 300+ line or multi-author documents
2. **No plugin, subagents available** — pass the checklist below to a cheap-model subagent as the review prompt, one file per subagent
3. **Neither** — apply the checklist inline

Either way the main context receives only a diff summary — do not read reference files in the main thread.

**Change-rate guard**: if suggested edits touch more than 30% of the document, report the findings and stop. Do not apply.

### Built-in checklist
Translationese — fix every hit, these are the loudest AI markers:
- 이중 피동 `되어진다 → 된다`, `보여진다 → 보인다`
- 잉여 동사 `경쟁력을 가지고 있다 → 경쟁력이 강하다`
- `~에 있어서` → `교육에 있어서 → 교육에서`
- `~에 대해`, `~와 관련하여` → `이 문제에 대해 논의한다 → 이 문제를 논의한다`
- `~를 통해`, `~에 기반하여` → `도구를 통해 측정한다 → 도구로 측정한다`
- 영어식 피동 `~에 의해` → `AI에 의해 생성된 텍스트 → AI가 만든 텍스트`
- 가능 표현 남발 `~할 수 있다` → `효율을 높일 수 있다 → 효율을 높인다`
- 목적절 남발 `~을 위해` → `성장을 위해 투자한다 → 성장에 투자한다`
- 미래 단정 `~것이다` → `매출이 증가할 것이다 → 매출이 증가한다`
- `~라는 점에서` → `빠르다는 점에서 효율적이다 → 빨라서 효율적이다`

Vocabulary and structure:
- AI 상투어 — cut or replace with the concrete fact: `혁신적인 솔루션 → 새 방식`
- 복수형 `-들` 과다 — `많은 학생들이 새로운 기능들을 → 많은 학생이 새 기능을`
- 지시관형사·대명사 반복 — `해당 기능을 쓰면 해당 결과를 → 이 기능을 쓰면 결과를`
- AI 결말 — `결론적으로, ~시사하는 바가 크다` — delete the paragraph, the conclusion belongs at the top
- `~적 N` 추상 체인 — `구조적 변화 → 구조의 변화`
- 3박자 나열 — `빠르고, 효율적이며, 안전하다 → 빠르고 안전하다`
- 불필요한 한자어 — `테스트를 실시한다 → 테스트한다`

Punctuation:
- 연결어미 뒤 쉼표 — `좋아서, 산책한다 → 좋아서 산책한다`
- 쉼표로 이어붙인 절 사슬 — split into separate sentences
- 영어식 콜론 — `방법은 다음과 같습니다: → 방법은 다음과 같다.`

Spelling, spacing, grammar:
- 되/돼 — `되요 → 돼요`, `됬다 → 됐다`
- 안/않 — `하지 안다 → 하지 않다`
- `-ㄴ지/-는지` — `좋는지 → 좋은지` (형용사는 `-은지`)
- 던/든 — 과거 회상은 던: `갔든 곳 → 갔던 곳`
- 의존명사 띄어쓰기 — `할수있다 → 할 수 있다`, `하는것 → 하는 것`
- 보조용언 띄어쓰기 — `하고있다 → 하고 있다`
- 조사 받침 선택 — `책를 → 책을`, `책가 → 책이`

## Exceptions
- Code blocks, commands, quotes, and proper nouns stay verbatim
- English documents are out of scope

---
Checklist distilled from [DaleSeo/korean-skills](https://github.com/DaleSeo/korean-skills) (MIT).
