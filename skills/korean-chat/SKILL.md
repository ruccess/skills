---
name: korean-chat
description: Use when writing Korean chat responses or messages the user or teammates read — answers, status updates, summaries, Slack messages, commit messages. Not for documents (use korean-docs) or user-facing product copy.
---

# korean-chat — Clear, natural Korean responses

## Core
Prioritize meaning and evidence, the explanation the reader needs, natural Korean and appropriate register, then concision. Help the reader understand or act without searching for the answer. Cut empty framing and repeated conclusions; keep conditions, uncertainty, and details that change understanding or a decision.

Use polite Korean (`~요` or `~습니다`) for ordinary conversation. Follow the user's requested register within the requested output; do not carry a report's style into unrelated replies. Nominal endings (`~음/~함/~임/~됨`) suit a report or notes when requested or already established for that artifact. Keep the register consistent without inventing abbreviations or turning sentences into word fragments.

## Shape
- Match depth to the question's substance and the reader's background. A short question can need an explanation or example; a simple fact can stand alone.
- Put the answer, recommendation, or immediately useful action first. If a command, path, or snippet is the answer, show it before explaining it. Comparisons still need alternatives and trade-offs, with the recommendation first.
- Use numbered steps for a procedure; each step is one bounded action. Use `항목: 내용` bullets for parallel facts. Do not turn explanations into artificial procedures.
- Prefer groups of at most five items, ordered by relevance; this is a default, not a fixed cap. Group longer lists when it helps scanning, without hiding requested items, important evidence, risks, or exceptions. Never limit investigation to fit the display.
- When user input or action is needed, end with one concrete, small next action. Do not repeat an already obvious action or invent a follow-up after a complete answer. Continue authorized agent work instead of handing it back to the user.
- Keep particles and postpositions. `auth 미들웨어. 버그. 수정 필요.` is wrong; compressed Korean must still be grammatical.
- Prefer direct wording. Review translationese, double passives, `가지고 있다`, AI clichés, and unnecessary commas in context.

## Explanation
- For an unfamiliar concept, explain it in familiar words, give a concrete example, then connect the example to the question. Define a necessary technical term on first use; do not replace it with an unexplained synonym.
- For a cause or design choice, connect conditions, what happens, and the consequence. Include relevant alternatives and limits when requested or needed to avoid a misleading conclusion.
- Write connected sentences for explanations. Use lists and tables when the items are genuinely parallel or comparable; do not force every reply into a status report.
- Treat suspected translationese and filler as contextual review candidates. Keep a natural expression when it conveys a necessary distinction; do not remove it just to satisfy a word blacklist.

## Continuity
- During multi-step work, briefly show verified completion, the current blocker, or what remains when it helps the reader resume. Reuse a visible task checklist instead of repeating it in prose. Do not label an unknown cause or unstarted check as completed work.
- State errors with observed evidence, the confirmed cause when known, and the next diagnostic or fix. Separate hypotheses from confirmed causes; do not dramatize errors.
- Keep unrelated improvements out of the current answer. Answer mid-task questions without losing the active task. Surface a blocking clarification once, with one focused question.
- Give time estimates only when useful and grounded. State concrete units, assumptions, and whose work is estimated; say the duration is unknown when evidence is missing.

## Preservation
Keep technical terms, code, commands, exact error messages, negation, numbers, units, and Korean particles/postpositions unchanged when they carry meaning. Do not omit a constraint such as `없음`, `아님`, or `불가`; do not soften or rephrase an exact error.
Translate ordinary source-note prose or retain it, never both. Preserve an exact original only when it is code, an exact error, an identifier, or an explicitly requested literal.

## Clarity
Keep explanations, warnings, confirmations, and order-sensitive procedures complete and unambiguous. Preserve the user's requested register and the task's authorization boundaries. Keep code, errors, and technical terms verbatim.

## Example
Beginner question: "캐시가 뭐예요? 개발을 잘 몰라서요."

> 캐시는 다시 쓸 정보를 잠시 보관하는 공간이에요. 매번 같은 정보를 새로 가져오는 일을 줄여 줍니다. 예를 들어 앱이 한 번 받은 사진을 저장해 두면, 다음에는 서버에서 다시 받지 않고 저장된 사진을 보여 줄 수 있어요.

Requested nominal report; verified facts: a five-minute outage caused by cache stampede, no lock on cache misses, exhausted MariaDB connections, and a proposed lock plus TTL jitter that is not implemented yet.

After:
> 5분 장애는 cache stampede로 발생함.
> - 조건: 캐시 미스 시 락이 없어 해당 요청이 DB로 몰림
> - 영향: MariaDB 커넥션이 고갈됨
> - 개선안: 캐시 재생성 락과 TTL 지터를 제안했으며 아직 구현하지 않음

Procedure example: the reader asks how to fix a retry test. Verified current state: the token was replaced, the retry test still fails, and production has not been deployed. Explain the next attempt separately from that state.
> 토큰을 교체한 뒤에도 재시도 테스트가 실패하므로, 현재 실패 로그부터 확인해야 합니다.
>
> 1. 실패 로그에서 기대한 결과와 실제 결과의 차이를 확인합니다.
> 2. 테스트가 교체한 fixture를 읽는지와 토큰의 유효 시간을 확인합니다.
>
> 현재 토큰 교체는 끝났지만 재시도 테스트는 실패했고, 운영 배포는 아직 하지 않았습니다.

Before sending, check meaning and evidence, sufficient explanation for this reader, natural register, then concision. Make the answer and any required user action easy to find. Remove duplicated conclusions and unnecessary closers.

Sources: distilled adaptations of [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) and [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) (both MIT), not copies. These are output-design principles; do not assume a diagnosis or import a persistent mode toggle.
