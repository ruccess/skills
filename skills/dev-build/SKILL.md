---
name: dev-build
description: Use when implementing a planned task — a plan document exists and code needs to be written, tested, and verified step by step.
---

# dev-build — 구현

## 게이트
계획 문서가 없으면 구현하지 않는다. /dev-plan으로 돌아간다.

## 절차
1. 프로젝트에 자체 실행 루프(스킬·하니스)가 있으면 그것을 따른다
2. 없으면 TDD 루프: 실패하는 테스트 → 최소 구현 → 리팩터. 계획의 단계 단위로 커밋한다
3. 단계마다 프로젝트 검증 명령(테스트·린트)을 실행한다. 실패를 안고 다음 단계로 가지 않는다
4. 계획에서 벗어나는 변경이 필요해지면 멈추고 계획을 갱신한 뒤 진행한다

## 완료 조건
계획의 전 단계 구현 완료 + 테스트 통과. 다음 단계: /dev-ship
