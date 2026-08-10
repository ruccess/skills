---
name: korean-chat
description: Use when writing Korean chat responses or messages the user or teammates read — answers, status updates, summaries, Slack messages, commit messages. Not for documents (use korean-docs) or user-facing product copy.
---

# korean-chat — Plain, natural Korean responses

## Core
This skill fixes two specific failures: answers so long-winded the reader cannot find the point, and stiff Korean from a model that thinks in English. Everything below serves those two. The shape rules are a default, not a template to fill — filling a three-part template with five paragraphs is the failure, not the fix.

## Length comes first
Cut the amount said before shaping how it is said.

- Answer in as few sentences as the question needs. A one-line question gets a one-line answer
- Delete: self-analysis, narrating your own process, restating the user's question, listing what you did not do, "정리하자면" summaries of what was just said
- Bullets are for three or more parallel items. Two items are one sentence
- Never add length to look thorough

## Default shape (when the answer has several parts)
1. **Lead**: one conclusion/verdict sentence in 해라체 ("~다"). No greetings, no preamble.
2. **Details**: 개조식 bullets in "항목: 내용" form. 함체 endings (~함/~임/~됨) allowed. Arrows (→) only inside bullets and tables.
3. **Next action**: one line if there is one, otherwise omit.

A short answer skips straight to the point and stops — no lead-and-bullets scaffolding around one fact.

## Sentence rules (guardrails, not goals)
These keep compression from breaking the Korean. Passing them is not the objective — being understood quickly is.

- Keep particles and endings. No literal fragment translation: "auth 미들웨어. 버그. 수정 필요." is wrong
- No translationese: "이 문제에 대해 논의" → "이 문제를 논의"
- No double passives: "되어진다" → "된다"
- "가지고 있다" → "있다" or an adjective
- No AI cliché vocabulary: 핵심적·효과적·혁신적·원천적으로·"안정적인 ~ 보장"
- Commas only when necessary

## Exceptions (use full sentences)
- Warnings for risky or irreversible actions; ordered multi-step procedures
- Code, error messages, and technical terms stay verbatim

## Example
Before: "안녕하세요, 어제 캐시 스탬피드 문제로 장애가 발생했습니다. 상황을 공유드립니다. …(중략)… 추가 질문 있으시면 말씀해 주세요."

After:
> 어제 5분 장애 원인은 cache stampede다. 캐시 미스 시 락이 없어서 전 요청이 DB로 직행했다.
> - 원인: 키 만료 순간 동시 요청 폭주 → MariaDB 커넥션 고갈
> - 조치: Redlock 재생성 락(1개 요청만 재생성, 나머지 대기) + TTL 지터
>
> 이번 주 구현하고 테스트 후 반영한다.
