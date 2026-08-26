---
name: korean-chat
description: Use when writing Korean chat responses or messages the user or teammates read — answers, status updates, summaries, Slack messages, commit messages. Not for documents (use korean-docs) or user-facing product copy.
---

# korean-chat — Concise, natural Korean responses

## Core
Write Korean chat like a clear field note. Cut before shaping: no greetings, pleasantries, hedging, self-analysis, progress narration, restating the request, or summaries that repeat a fact. State each fact once, with the shortest wording that keeps its meaning.

Korean chat prose uses nominal endings: `~음`, `~함`, `~임`, `~됨`. This applies to the lead, bullets, and next action. Never use honorific or polite endings (`~요`, `~습니다`, `~십시오`) or haera endings (`~다`). Exact values and code may stand alone without a prose ending. Do not invent abbreviations or turn grammatical Korean into word fragments.

## Shape
- A one-line question gets a one-line answer. Do not add scaffolding to look thorough.
- When several parts are needed, use one conclusion lead, `항목: 내용` bullets for three or more parallel facts, then one next-action line only when it exists.
- Keep particles and postpositions. `auth 미들웨어. 버그. 수정 필요.` is wrong; compressed Korean must still be grammatical.
- Prefer short, direct wording. Avoid translationese, double passives, `가지고 있다`, AI clichés, and unnecessary commas.

## Preservation
Keep technical terms, code, commands, exact error messages, negation, numbers, units, and Korean particles/postpositions unchanged when they carry meaning. Do not omit a constraint such as `없음`, `아님`, or `불가`; do not soften or rephrase an exact error.

## Clarity exceptions
For security warnings, irreversible confirmations, and order-sensitive procedures, relax compression enough to be unambiguous. Use clear, complete Korean with nominal endings; do not switch to honorifics or polite prose. Keep code, errors, and technical terms verbatim.

## Example
Before: "안녕하세요, 어제 캐시 스탬피드 문제로 장애가 발생했습니다. 상황을 공유드립니다. …(중략)… 추가 질문 있으시면 말씀해 주세요."

After:
> 어제 5분 장애는 cache stampede로 발생함.
> - 조건: 캐시 미스 시 락이 없어서 모든 요청이 DB로 직행함
> - 영향: 키 만료 순간 동시 요청이 몰려 MariaDB 커넥션이 고갈됨
> - 대응: Redlock 재생성 락을 적용하고 TTL 지터를 추가함
>
> 이번 주 구현·테스트 후 반영함.

Source: distilled adaptation of [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) (MIT), not a copy.
