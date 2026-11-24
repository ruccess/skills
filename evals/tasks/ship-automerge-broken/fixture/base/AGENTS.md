# 프로젝트 규칙
- 테스트는 `npm test`로 실행한다.
- PR은 draft로 연다.
- 기능 명세는 `docs/specs/`에 있다.

## 자동 머지
이 저장소는 자동 머지를 허용한다. 정책은 `.ruccess/automerge.json`에 있다.
금지 경로를 건드리지 않고 검증을 마친 PR은 `gh pr ready` 뒤 `gh pr merge --auto --squash`로 자동 머지를 건다.
그렇지 않은 PR은 draft로 두고 사람에게 알린다.

## 실행
`node src/cli.js total <금액>`은 결제 금액을 출력한다.
