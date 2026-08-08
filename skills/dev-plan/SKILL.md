---
name: dev-plan
description: Use when starting a new development task — before any code is written, when requirements are still fuzzy, or when an isolated workspace and a written plan are needed.
---

# dev-plan — 작업 시작

## 핵심
코드보다 계획이 먼저다. 산출물은 계획 문서와 격리된 작업 공간이다.

## 절차
1. **요구 확정**: 목적·범위·완료 조건을 사용자와 확정한다. 모호하면 구현하지 말고 묻는다
2. **프로젝트 규칙 로드**: 대상 저장소의 AGENTS.md·CLAUDE.md·CONTRIBUTING을 읽는다. 저장소별 규칙(브랜치·커밋·검증 명령)이 이 스킬보다 우선한다
3. **격리 공간**: 프로젝트에 작업 시작 스크립트나 스킬이 있으면 그것을 따른다. 없으면 git worktree 또는 새 브랜치를 만든다
4. **계획 문서**: 구현 단계·리스크·검증 방법을 문서로 남긴다. 각 단계는 독립적으로 검증 가능해야 한다

## 완료 조건
계획 문서가 존재하고 작업 공간이 준비됨. 다음 단계: /dev-build
