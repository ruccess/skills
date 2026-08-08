# ruccess/skills

개발 작업 라이프사이클을 3개 스킬로 나눈 에이전트 스킬 모음이다.
Agent skills for the dev task lifecycle: **plan → build → ship**.

| 스킬 | 담당 | 산출물 |
|---|---|---|
| `dev-plan` | 요구 확정, 작업 공간 격리, 계획 수립 | 계획 문서 + worktree/브랜치 |
| `dev-build` | 계획 기반 TDD 구현 | 단계별 커밋 + 테스트 통과 |
| `dev-ship` | 정리 → 리뷰 → 문서 검수 → 검증 → draft PR | draft PR |

## 설계 원칙
- **저장소 규칙 우선**: 커밋·브랜치·PR·검증 명령은 대상 저장소의 지침을 따른다. 스킬은 순서와 게이트만 정의한다
- **얇은 오케스트레이션**: 프로젝트에 자체 시작 스크립트·실행 루프가 있으면 그것을 재사용한다
- **게이트**: 검증 실패 상태로 PR을 만들지 않는다. PR은 항상 draft로 시작한다

## 설치 (Claude Code)
```bash
claude plugin marketplace add ruccess/skills
claude plugin install ruccess@ruccess
```

## Codex
스킬 본문은 런타임 중립 markdown이다. `~/.codex/prompts/`에 심볼릭 링크로 연결해 쓴다:
```bash
for s in dev-plan dev-build dev-ship; do ln -sf "$(pwd)/skills/$s/SKILL.md" ~/.codex/prompts/$s.md; done
```

## License
MIT
