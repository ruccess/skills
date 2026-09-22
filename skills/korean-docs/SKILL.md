---
name: korean-docs
description: Use when producing or revising Korean documents others will read — ADRs, plans, proposals, incident reports, README, any .md deliverable — and when reviewing such documents before commit.
---

# korean-docs — Korean document writing and review

## Core
Documents are complete prose — different from korean-chat's lead-plus-bullets shape. Prioritize human readability and natural Korean, then review against the built-in checklist before commit. The korean-skills plugin is an optional precision upgrade, not a requirement.

## Writing rules
- Structure: Put the conclusion or summary first and evidence and detail after. Use concrete noun-phrase headings that reveal the document's flow.
- Paragraphs: State one claim per paragraph. Usually use two to four sentences, but use a shorter or longer paragraph when the claim needs it.
- Source lines: In prose paragraphs and prose in list items, put each complete Markdown sentence on its own source line. Do not hard-wrap a sentence; add a blank line only when its meaning or topic changes. Tables, code blocks, commands, and quotes are exempt, subject to repository formatter precedence.
- Forms: Use lists only for parallel items and tables for repeated-field comparisons. Reserve emphasis and callouts for decisions or warnings.
- Style: Write complete declarative sentences ("~한다/~이다"). Use 개조식 only inside lists and tables.
- Natural Korean: Check grammatical correctness, natural word order, subject-predicate agreement, modifier proximity, particles, tense, and honorific consistency.
- Terms: Replace English noun chains and long noun phrases with active Korean sentences that have verbs. Prefer concrete words over abstract or Hanja-heavy wording, define a technical term briefly on first use, then use it consistently.
- Fidelity: Do not add unsupported qualifiers. Preserve exact numbers, units, paths, commands, code, and error messages.
- Language-quality checks shared with korean-chat cover translationese (attach particles directly), double passives, "가지고 있다", AI cliché vocabulary (핵심적·효과적·혁신적·원천적으로), and unnecessary commas.
- These checks do not carry over korean-chat's nominal endings; documents use declarative "~한다/~이다" endings.
- Formatter: Follow repository formatting and writing rules when they conflict with these rules, and record the exception in the review findings.

## Arrows
- When a short linear relationship is faster to scan than prose, prefer or propose a `→` expression. Use it only for one unambiguous cause, state transition, or input-processing-output relation with at most three or four nodes.
- An arrow-only expression must name its actors and relationship clearly.
- Do not use arrows in prose or for branches, exceptions, loops, or detailed procedures. Use a numbered list, table, or Mermaid instead.

## Review (before commit)
Target: Korean .md deliverables others will read. Two passes, in this order. The order is the point — a checklist handed over first becomes the whole review, and the document goes unread.

**The two passes run in separate contexts.** This is the load-bearing part. A reviewer who can see the checklist reviews against the checklist — measured, not assumed: with both in one prompt, findings collapse onto listed patterns even when the sections are split apart by instruction. Keep the checklist out of pass 1's context entirely.

**Pass 1 — read it as the reader.** Dispatch a cheap-model subagent with the document and these questions only. Paste no part of the checklist, and do not name its categories:

> 이 문서를 처음 읽는 사람 입장에서 읽었는가?
> 어디서 막히거나 잘못 이해하겠는가?
> 문서가 약속해 놓고 설명하지 않은 내용은 무엇인가?
> 제목만 훑어도 흐름과 필요한 정보를 찾을 수 있는가?
> 한 문장이면 될 것을 다섯 문장으로 늘어놓은 문단은 어디인가?
> 한 문단에 주장이 섞였는가?
> 완결 문장 여러 개가 한 소스 줄에 몰렸거나, 한 문장이 여러 소스 줄로 잘렸는가?
> 의미가 이어지는데 빈 줄로 끊겼거나, 의미가 바뀌었는데 빈 줄이 없는 곳은 어디인가?
> 목록·표·화살표가 읽는 일을 실제로 줄이는가?
> 문장보다 빨리 읽히는 짧은 선형 관계를 화살표 후보로 놓쳤거나, 분기·예외·반복을 화살표로 줄여 오해를 만들지는 않는가?
> 이 문서대로 실행하려는 사람에게 빠진 정보는 무엇인가?

**Pass 2 — natural-language and pattern guardrail.** A separate subagent first checks natural Korean word order, subject-predicate agreement, modifier proximity, particles, tense, honorific consistency, terminology, and verb-bearing phrasing. For an approved or confirmed schedule, use direct tense (`금요일 오후 3시에 진행할 예정이다` → `금요일 오후 3시에 진행한다`) while preserving the exact time; retain future wording when execution or timing is undecided. It then audits the entire document against every checklist item below as a safety net. Do not rewrite by regex alone; read each proposed change in context. It catches what an unaided read misses: habitual translationese, spacing, particle agreement. It is a net, not a syllabus — hitting the same pattern six times usually means matching replaced reading.

With the korean-skills plugin installed, pass 2 becomes its `humanizer` then `grammar-checker`, sequential (order matters — humanizer rewrites, grammar-checker cleans up after; add `style-guide` only for 300+ line or multi-author documents). Pass 1 stays as written either way.

Where no subagents exist, run pass 1 first and write its findings down before opening the checklist. Merge nothing until both are complete; group findings by pass and sort by severity within each pass, using location, reader impact, minimal fix, and severity. Report pass 1 first; its recommendation prevails only when findings conflict.

Either way the main context receives only a findings summary — do not read reference files in the main thread.

**Change-rate guard**: calculate `changed nonblank prose lines / total nonblank prose lines` from the original document's source lines before any proposed reflow, excluding code blocks, commands, and quotes. One original prose line remains one denominator line even when it contains multiple sentences. If the rate is greater than 30%, report the numerator, denominator, rate, and findings, then stop. Do not apply.

### Built-in checklist
Translationese — inspect each candidate in context. Preserve uncertainty, modality, tense, and factual claims; grammatical wording is not an error merely because it matches a pattern:
- 이중 피동 `되어진다 → 된다`, `보여진다 → 보인다`
- 잉여 동사 `경쟁력을 가지고 있다 → 경쟁력이 있다` — do not add an unsupported degree such as `강하다`.
- `~에 있어서` → `교육에 있어서 → 교육에서`
- `~에 대해`, `~와 관련하여` → `이 문제에 대해 논의한다 → 이 문제를 논의한다`
- `~를 통해`, `~에 기반하여` → `도구를 통해 측정한다 → 도구로 측정한다`
- 영어식 피동 `~에 의해` → `AI에 의해 생성된 텍스트 → AI가 만든 텍스트`
- Possibility and capability: preserve `효율을 높일 수 있다` when the improvement is possible or conditional; use `효율을 높인다` only when the source establishes that claim.
- 목적절 남발 `~을 위해` → `성장을 위해 투자한다 → 성장에 투자한다`
- Predictions: preserve the future meaning of `매출이 증가할 것이다`; do not rewrite a forecast as an observed present fact. Confirmed schedules follow the Pass 2 rule above.
- `~라는 점에서` → `빠르다는 점에서 효율적이다 → 빨라서 효율적이다`

Vocabulary and structure:
- AI 상투어 — cut or replace with the concrete fact: `혁신적인 솔루션 → 새 방식`
- 복수형 `-들` 과다 — `많은 학생들이 새로운 기능들을 → 많은 학생이 새 기능을`
- 지시관형사·대명사 반복 — `해당 기능을 쓰면 해당 결과를 → 이 기능을 쓰면 결과를`
- AI conclusion framing: remove empty framing such as `결론적으로` or unsupported `시사하는 바가 크다`, while preserving unique facts, requirements, and exceptions in the paragraph. Delete a whole paragraph only when it contains no information beyond what is already retained.
- `~적 N` 추상 체인 — `구조적 변화 → 구조의 변화`
- Three-part lists: `빠르고, 효율적이며, 안전하다 → 빠르고 효율적이며 안전하다`. Preserve distinct supported properties; remove an item only when it is redundant or unsupported, not to reduce the item count.
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
