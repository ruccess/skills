---
name: dev-ship
description: Use when a task's implementation is complete and the work needs finalizing — cleanup, review, docs check, verification, and a draft pull request.
---

# dev-ship — 마무리와 draft PR

## 핵심
구현 완료와 출하 가능은 다르다. 6단계를 순서대로 통과해야 draft PR을 만든다.

## 절차 (순서 고정)
1. **변경 파악**: `git diff <base>...HEAD`로 전체 변경을 확인하고 미커밋 변경을 정리한다
2. **코드 정리**: 동작 보존 정리만 한다 — 단순화·데드코드 제거·네이밍. 기능 추가 금지
3. **리뷰**: 코드 리뷰를 실행한다(가능하면 언어별 리뷰 에이전트 병렬). CRITICAL·HIGH는 수정하고 MEDIUM 이하는 목록으로 보고한다
4. **문서 검수**: 변경분에 한국어 문서가 있으면 검수 파이프라인을 돌린다(korean-docs 스킬이 있는 환경에서)
5. **검증**: 프로젝트의 테스트·린트 명령을 실행한다. 실패하면 여기서 멈춘다 — PR 단계로 넘어가지 않는다
6. **draft PR**: 커밋·브랜치·PR 규칙은 대상 저장소 지침을 따른다. 생성 직전에 제목·본문 요약·대상 브랜치를 한 줄로 보고한 뒤 `gh pr create --draft`

## 금지
- 검증 실패 상태로 PR 생성 — "CI에서 확인하겠다"는 이유가 되지 않는다
- 리뷰 단계 생략 — "작은 변경이라서"는 이유가 되지 않는다
- draft 아닌 일반 PR을 기본으로 생성
- PR 본문에 실행하지 않은 "테스트 완료" 서술

## 완료 조건
draft PR URL 보고 + 남은 MEDIUM 이하 이슈 목록
