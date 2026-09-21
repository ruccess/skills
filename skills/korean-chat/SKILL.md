---
name: korean-chat
description: Use when writing Korean chat responses or messages the user or teammates read — answers, status updates, summaries, Slack messages, commit messages. Not for documents (use korean-docs) or user-facing product copy.
---

# korean-chat — Concise, natural Korean responses

## Core
Write Korean chat so the reader can act without searching for the answer. Cut greetings, pleasantries, empty hedging, self-analysis, announcements of intent, restating the request, and repeated conclusions. Keep uncertainty that changes a decision. State each fact once, with the shortest wording that keeps its meaning.

Unless the user explicitly requests another register, Korean chat prose uses nominal endings: `~음`, `~함`, `~임`, `~됨`. This applies to the lead, bullets, and next action. Under this default, do not use honorific or polite endings (`~요`, `~습니다`, `~십시오`) or haera endings (`~다`). Exact values and code may stand alone without a prose ending. Do not invent abbreviations or turn grammatical Korean into word fragments.

## Shape
- A one-line question gets a one-line answer. Do not add scaffolding to look thorough.
- Put the answer, recommendation, or immediately useful action first. If a command, path, or snippet is the answer, show it before explaining it. Comparisons still need alternatives and trade-offs, with the recommendation first.
- Use numbered steps for a procedure; each step is one bounded action. Use `항목: 내용` bullets for parallel facts. Do not turn explanations into artificial procedures.
- Prefer groups of at most five items, ordered by relevance; this is a default, not a fixed cap. Group longer lists when it helps scanning, without hiding requested items, important evidence, risks, or exceptions. Never limit investigation to fit the display.
- When user input or action is needed, end with one concrete, small next action. Do not repeat an already obvious action or invent a follow-up after a complete answer. Continue authorized agent work instead of handing it back to the user.
- Keep particles and postpositions. `auth 미들웨어. 버그. 수정 필요.` is wrong; compressed Korean must still be grammatical.
- Prefer short, direct wording. Avoid translationese, double passives, `가지고 있다`, AI clichés, and unnecessary commas.

## Continuity
- During multi-step work, briefly show verified completion, the current blocker, or what remains when it helps the reader resume. Reuse a visible task checklist instead of repeating it in prose. Do not label an unknown cause or unstarted check as completed work.
- State errors with observed evidence, the confirmed cause when known, and the next diagnostic or fix. Separate hypotheses from confirmed causes; do not dramatize errors.
- Keep unrelated improvements out of the current answer. Answer mid-task questions without losing the active task. Surface a blocking clarification once, with one focused question.
- Give time estimates only when useful and grounded. State concrete units, assumptions, and whose work is estimated; say the duration is unknown when evidence is missing.

## Preservation
Keep technical terms, code, commands, exact error messages, negation, numbers, units, and Korean particles/postpositions unchanged when they carry meaning. Do not omit a constraint such as `없음`, `아님`, or `불가`; do not soften or rephrase an exact error.
Translate ordinary source-note prose or retain it, never both. Preserve an exact original only when it is code, an exact error, an identifier, or an explicitly requested literal.

## Clarity exceptions
For requested explanations, security warnings, irreversible confirmations, and order-sensitive procedures, relax compression enough to be complete and unambiguous. Preserve the user's requested register and the task's authorization boundaries. Keep code, errors, and technical terms verbatim.

## Example
Before: "안녕하세요, 어제 캐시 스탬피드 문제로 장애가 발생했습니다. 상황을 공유드립니다. …(중략)… 추가 질문 있으시면 말씀해 주세요."

After:
> 어제 5분 장애는 cache stampede로 발생함.
> - 조건: 캐시 미스 시 락이 없어서 모든 요청이 DB로 직행함
> - 영향: 키 만료 순간 동시 요청이 몰려 MariaDB 커넥션이 고갈됨
> - 대응: Redlock 재생성 락을 적용하고 TTL 지터를 추가함
>
> 이번 주 구현·테스트 후 반영함.

Procedure example (the reader asked to make the change):
> 만료 토큰 fixture를 유효한 토큰으로 교체해야 함.
>
> 1. fixture의 토큰을 테스트 시점에 유효하도록 수정함
> 2. 실패했던 재시도 테스트를 다시 실행함
>
> 토큰 교체는 완료됐지만 재시도 테스트는 실패했고, 운영 배포는 아직 하지 않음.

Before sending, check that the first line answers the request, the current state is truthful, and any required user action is easy to find. Remove duplicated conclusions and unnecessary closers.

Sources: distilled adaptations of [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) and [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) (both MIT), not copies. These are output-design principles; do not assume a diagnosis or import a persistent mode toggle.
