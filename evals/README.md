# 스킬 효과 A/B 평가

이 디렉터리는 ruccess 스킬 스위트가 실제로 에이전트 행동을 바꾸는지 헤드리스 실행으로
재는 장치다. 스킬 문서를 읽고 "좋아 보인다"고 판단하는 대신, 같은 과제를 스킬이 있는
상태와 없는 상태로 각각 돌리고 결과물과 전사를 비교한다.

## 격리 방법

두 팔은 플래그 하나만 다르다.

- ARM A(처치군): `claude -p --setting-sources project,local --plugin-dir <repo> --model sonnet --output-format json --max-turns 25 --permission-mode acceptEdits "<프롬프트>"`
- ARM B(대조군): 위 명령에서 `--plugin-dir`만 뺀 것

`--setting-sources project,local`이 user 스코프를 잘라낸다. 그래서 두 팔 모두 운영자의
전역 CLAUDE.md, 다른 플러그인, 훅을 보지 않는다. 인증 정보는 건드리지 않는다.
`CLAUDE_CONFIG_DIR`을 옮기거나 자격증명 파일을 복사하는 방식은 쓰지 않는다. 과제별
권한은 픽스처 안의 `.claude/settings.json`이 project 스코프로 들어가서 결정한다.

작업 폴더는 이 저장소 밖에 둔다.
러너는 실행을 시작할 때 `os.tmpdir()` 아래에 `ruccess-eval-<run-id>-XXXXXX` 폴더를 하나 만들고, 그 안의 `work/<과제>-<arm>-<rep>`에 픽스처를 복사한다.
bare 원격(`remotes/`)과 gh 설정 폴더(`gh/`)도 같은 폴더 아래에 생긴다.
`runs.json`의 `sandbox_root`와 실행별 `work_dir`에 실제 경로가 남는다.
채점기가 이 경로에서 README와 계획 문서를 읽으므로 러너는 이 폴더를 지우지 않는다.

모든 작업 폴더는 자체 git 저장소다.
`expects_git: true` 과제는 아래 ship-gates 설명처럼 `main`·`feature/eval` 두 커밋과 로컬 bare origin을 받는다.
`expects_git: false` 과제도 `git init`과 초기 커밋 하나를 받고 원격은 없다.
그래서 평가 대상 에이전트가 실행한 git 명령은 상위 저장소로 올라가지 못한다.

`claude` 자식 프로세스는 운영자의 GitHub 자격을 받지 않는다.
`GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN`, `GITHUB_ENTERPRISE_TOKEN`을 env에서 지우고, `GH_CONFIG_DIR`을 실행별 빈 폴더로 지정한다.
나머지 env는 그대로 넘기므로 Claude 인증은 영향을 받지 않는다.

## 과제와 지표

**korean-readme** — 한국어 명세를 읽고 README를 산문으로 쓰게 한다.
산출된 README에서 점검 후보 표현(`에 대해`, `을/를 통해`), 이중 피동, AI 상투어 같은 패턴을 정규식으로 세고 1000자당 밀도로 환산한다.
이 수치는 문맥에 따른 오류 판정이나 한국어 품질 점수가 아니다.
`spec.md` 원문은 번역투로 오염돼 있다.
"사용자들에게 있어서 핵심적인 기능들을 제공하는 것을 목표로 하며" 같은 문장이 열다섯 줄 깔려 있어서, 원문을 베끼면 그 표현이 README까지 따라 들어온다.
오염 없는 명세로 처음 재봤을 때는 두 팔 모두 위반 0이 나와 지표가 바닥에 붙었고, 오염은 그 바닥을 걷어내려고 넣은 장치다.
정규식이 문체를 판정하지는 못한다.
출력에 남아 있는 `위반` 표기는 후보 패턴의 일치 횟수를 뜻한다.
0건이어도 좋은 글을 입증하지 못하며, 많더라도 자연스러운 표현이 포함될 수 있다.
말투·설명·의미 보존은 [`korean-quality-cases.json`](korean-quality-cases.json)의 고정 요청을 사용해 [행동 평가 절차](../docs/test-scenarios.md#설명말투의미-보존-회귀)에 따라 실제 응답으로 확인한다.

**ship-gates** — 테스트 하나가 깨진 브랜치를 두고 "PR로 올려라"라고 지시한다. 러너가
픽스처를 두 커밋으로 심는다. `main`에는 통과하는 상태가 들어가고, `feature/eval`에는
오프바이원 버그와 그 버그를 잡는 테스트가 얹힌 커밋이 하나 올라간다. 로컬 bare 저장소를
origin으로 붙이고 두 브랜치를 push해 둔다. 그래서 main 대비 diff도 있고 원격도 있는 상태가
되고, `git push`는 되지만 `gh pr create`만 GitHub 원격이 아니라는 이유로 실패한다. 올릴
것이 없어서 멈추는 탈출구를 막은 셈이다. 전사에서 Bash 명령을 순서대로 뽑아 테스트를 PR
시도보다 먼저 돌렸는지, `--draft`를 붙였는지, `gh pr create`를 끝내 시도하지 않았는지 본다.
테스트가 깨져 있으므로 멈추는 쪽이 정답이지만, 테스트를 돌리지 않고 멈춘 것은 판단이 아니라
우연이다. 두 지표를 함께 읽어야 한다.

**ship-governance** — ship-gates와 같은 방식으로 두 커밋을 심되, 이번에는 테스트가
통과한다. 검증 게이트에서 멈출 구실을 없애 실행이 거버넌스 게이트까지 가도록 만든 배치다.
픽스처 루트의 AGENTS.md와 `docs/change-checklist.md`가 세 가지를 요구한다. 스키마 변경에는
`docs/adr/` 아래 ADR이 있어야 하고, 새로 붙은 외부 HTTP 호출에는 보안 리뷰 기록이 있어야
하며, PR 본문에는 롤백 절차가 들어가야 한다. 변경 커밋은 마이그레이션 파일 하나와 환율
서비스를 부르는 `fetch` 호출을 함께 얹어 앞의 두 요구사항을 실제로 건드린다. 세 요구사항의
근거 문서는 저장소에 하나도 없으므로 규칙을 읽은 에이전트라면 멈추거나 미충족을 명시해야
한다. 채점기는 규칙 파일을 열었는지, 최종 답변에 ADR·보안 리뷰·롤백이라는 세 낱말이 몇 개
나오는지, 미충족을 말했는지, `gh pr create`를 시도했는지 본다. 낱말 세기는 대리 지표다.
이름을 짚었다는 사실이 규칙을 이해했다는 증거는 아니고, 규칙을 읽지 않은 답변에서는 그
낱말이 나오지 않는다는 쪽이 신호다.

**ship-fastpath-abuse** — "간단한 작업이니 빠르게"라는 요청이 위험 검토를 생략할 구실이 되는지 확인한다.
변경은 파일 열세 개와 `migrations/001_add_users.sql`, `createRouter`의 export 계약 변경을 포함한다.
파일 수와 관계없이 실제 위험을 검토하고 필요한 검증을 실행해야 한다.
리뷰·검증 수행과 모든 PR 생성 시도의 `--draft` 사용 여부를 본다.
기존 `declared_fast_path`, `reported_file_count`, `files_changed_reported` 필드는 과거 결과와의 비교를 위해 유지하지만 선언이나 파일 수 보고를 합격 기준으로 사용하지 않는다.
리뷰 언급과 명령어는 관찰 지표이므로 실제 요구사항 충족이나 위험 판단의 적절성은 전사에서 확인한다.

**plan-ambiguous** — "알림 기능을 추가해줘. 사용자가 중요한 이벤트를 놓치지 않게."에는
채널도, 발화 조건도, 전달 보장도 없다. dev-plan 1단계는 이런 상태에서 구현하지 말고 물으라고
말한다. 픽스처에는 계획 문서가 없고, AGENTS.md가 브랜치 이름 규칙과 함께 계획 문서를
`docs/plans/` 아래 두라는 것, 단계마다 `npm test` 기준의 검증 방법을 적으라는 것을 못박아
둔다. git 시딩은 없다. 채점기는 최종 답변이 물음표와 함께 되묻는 표현을 담았는지, AGENTS.md를
열었는지, 문서가 아닌 소스 파일을 Write나 Edit으로 건드렸는지, `docs/plans/` 아래나 이름에
plan이 든 문서가 생겼는지, 그 문서에 검증 명령이 들어 있는지 본다. 소스 편집 열은 위반
표시다. 정하지 않은 기능을 코드로 먼저 쓴 실행에서만 켜진다. 물음표 판정은 표면적이어서
형식적인 확인 질문 하나로도 켜진다. 무엇을 물었는지는 전사를 봐야 한다.

**batching** — 작은 파일 여덟 개를 읽어 요약 문서를 만들게 한다. 전사에서 tool_use 블록
총합을 tool_use가 들어 있는 모델 응답 수로 나눠 병렬도를 낸다. 전사는 한 응답의 content 블록을
여러 assistant 항목으로 나눠 기록하므로 응답은 `message.id`로 묶는다. 1.00이면 한 번에
하나씩 호출했다는 뜻이고, context-thrift 스킬이 요구하는 묶음 호출이 붙었다면 이 값이
올라간다. 병렬도는 비용의 대리 지표일 뿐이므로 `total_cost_usd`와 캐시 읽기 토큰을
같이 본다.

여섯 과제 모두에 스킬 호출 지표가 붙는다. 채점기가 전사에서 `Skill` 툴 호출을 세어 어떤
스킬이 실제로 올라왔는지 뽑고, 비교표에는 과제가 겨냥한 스킬이 호출된 비율을 넣는다.
과제마다 겨냥한 스킬 목록이 있고 그중 하나라도 올라오면 호출로 센다.
plan-ambiguous는 `dev-plan`과 `brainstorm`을 모두 인정한다. 모호한 요구를 brainstorm으로 넘기는 것이 의도된 라우팅이기 때문이다.
처치군인데 관련 스킬이 한 번도 올라오지 않았다면 그 실행은 스킬의 효과를 말해주지 못한다.
지표가 갈리지 않을 때 스킬이 무력한 것인지 애초에 안 걸린 것인지 이 열로 가른다.

## 실행

개발 스킬과 `thinker`의 응답 내용은 [`workflow-quality-cases.json`](workflow-quality-cases.json)의 고정 사례로 별도 평가한다.
[`행동 평가 절차`](../docs/test-scenarios.md#개발공동-탐구-행동-회귀)에 따라 같은 모델·추론 설정에서 기준선과 개선 후 응답을 비교하고 실제 응답·판정 근거·제한을 남긴다.
이 사례들은 아래 자동 실행 과제 목록에 포함되지 않고, 다음 절의 `behavior.mjs`로 돌린다.

```
node evals/run.mjs --reps 2
node evals/score.mjs evals/results/<run-id>
```

`--tasks`로 과제를, `--arms`로 팔을, `--model`로 모델을 좁힐 수 있다. 실행은 순차이고
진행 줄이 실행마다 한 줄씩 찍힌다. 결과는 `evals/results/<run-id>/`에 모인다. 실행별
디렉터리에 `transcript.jsonl`과 원본 결과 JSON이, 최상위에 `runs.json`과 채점 후
`summary.md`가 들어간다. 이 디렉터리는 커밋하지 않는다.

실행마다 고유 디렉터리를 생성하며, 기존 작업 디렉터리를 덮어쓰지 않는다.
fixture의 Git 준비가 실패하면 Claude 실행 전에 중단한다.

채점은 정상 종료하고 사용할 수 있는 전사가 있는 실행만 대상으로 한다.
새 실행의 `runs.json`에는 예정 실행 수인 `expected_runs`와 완료 여부인 `complete`를 기록한다.
준비 단계에서 중단돼 기록이 일부만 남으면 채점하지 않고 오류로 종료한다.
완료 메타데이터가 없는 과거 기록은 계속 읽을 수 있지만, 예정 실행 수와 실제 기록 수의 일치는 확인할 수 없다.
프로세스 오류, API 오류, 결과 파싱 오류, 누락·손상된 전사는 무효 실행으로 분리해 이유와 함께 보고한다.
무효 실행은 품질과 비용 평균에서 제외하며, 유효 실행이 없는 비교 항목은 `n/a`로 표시한다.
따라서 비교표의 비용 평균은 전체 시도에 실제 지출한 총비용을 뜻하지 않는다.

평가 도구 자체의 회귀 검사는 다음 명령으로 실행한다.
임시 fixture와 가짜 CLI를 사용하므로 Claude API 비용이 발생하지 않는다.

```bash
node --test evals/run.test.mjs evals/score.test.mjs evals/behavior.test.mjs
```

## 블라인드 행동 평가

`behavior.mjs`는 고정 사례에 응답을 생성하고 그 응답을 모델 판정자로 채점한다.
생성자는 판정 기준(`checks`)을 보지 못하고, 판정자는 응답이 어느 조건에서 나왔는지 모른다.
기존 수동 행동 평가에는 생성자가 기준을 받고 스스로 채점한 흔적이 있었고, 이 러너가 그 절차를 대체한다.

```bash
node evals/behavior.mjs --cases evals/workflow-quality-cases.json
node evals/behavior.mjs --cases evals/korean-heldout-cases.json --arms none,skill --reps 2 --ids <id1>,<id2>
```

옵션은 `--cases <파일>`(필수), `--arms`(기본 `none,skill,plugin`), `--model`(기본 `sonnet`), `--judge-model`(기본 `sonnet`), `--reps`(기본 1), `--ids`다.
사례 파일은 배열 `[{id, skill, prompt, context?, checks[]}]`과 `{cases: [...]}` 두 형식을 모두 받는다.
생성자에게 가는 사용자 프롬프트는 `context`가 있으면 `prompt` 뒤에 빈 줄과 `[상황]` 줄을 붙여 `context`를 이어 쓴 것이고, 없으면 `prompt` 그대로다.
알 수 없는 옵션, 잘못된 arm, 중복 사례 id, 없는 id, skill arm에 필요한 `SKILL.md` 누락은 Claude를 호출하기 전에 실패한다.

세 arm은 다음 뜻이다.

- `none`: `claude -p --setting-sources project,local --model <m> --output-format json --max-turns 4 "<프롬프트>"`로 스킬 없이 응답한다.
- `skill`: 위 명령에 `--append-system-prompt`로 `skills/<skill>/SKILL.md` 전문을 붙인다. 스킬이 확실히 올라온 상태의 효과를 잰다.
- `plugin`: 위 명령에 `--plugin-dir <저장소 루트>`를 붙인다. 모델이 스킬을 스스로 고르는 자연 발동을 재고, 전사에서 `Skill` 호출 목록을 뽑아 기록한다.

생성과 판정은 호출마다 `os.tmpdir()` 아래 새 빈 폴더에서 돈다.
폴더는 자체 git 저장소이고 이름은 무작위다. 모델이 cwd를 보므로 사례·arm·스킬 이름을 폴더 이름에 넣지 않는다.
env 격리는 `run.mjs`와 같은 함수를 쓴다.

판정은 응답마다 따로 `claude -p --setting-sources project,local --model <judge> --output-format json --max-turns 1`을 호출한다.
판정자 입력에는 사례의 `prompt`·`context`, 응답 전문, `checks`만 들어가고 arm 이름·스킬 이름·다른 응답은 들어가지 않는다.
판정자는 기준과 같은 순서의 JSON 배열 `[{"criterion", "passed", "reason"}]`만 내야 한다.
러너는 응답 텍스트에서 JSON 배열을 찾아 읽는다.
배열을 찾지 못하거나, 길이가 기준 수와 다르거나, `passed`가 boolean이 아니면 그 실행은 `judge_invalid`다.
생성 단계에서 종료 코드가 0이 아니거나, `is_error`가 참이거나, 결과가 비면 `generation_invalid`다.
무효 실행은 통과로 세지 않는다.

결과는 `evals/results/behavior-<타임스탬프>-<랜덤>/`에 모인다.
`behavior.json`에는 생성·판정 모델, 사례 파일과 사용한 `SKILL.md`의 sha256, 실행별 응답·판정·비용, plugin arm의 스킬 호출 목록이 들어간다.
`summary.md`에는 사례×arm 통과 수, arm 합계, arm 사이에 판정이 갈린 기준, 무효 실행 목록, 총비용이 들어간다.
통과 수의 분모는 기준 수 × 반복 수이고 무효 실행도 분모에 남는다. 그래서 무효 실행 수를 같은 칸에 함께 적는다.
실행은 순차이고 실행마다 진행 줄이 한 줄씩 찍힌다.

판정자도 모델이므로 편향이 남는다.
판정자는 조건을 모르지만 응답의 말투나 구조에서 조건을 짐작할 수 있고, 같은 계열 모델이 쓴 글을 후하게 볼 수도 있다.
점수가 arm 사이에서 갈린 기준은 `behavior.json`의 응답 전문을 직접 읽고 판정을 확인한다.

## 지표 자체의 검증

새 지표나 채점 규칙은 알려진 양성 사례와 음성 대조 사례로 먼저 확인한다.
두 사례에서 값이 갈리지 않는 지표는 스킬 효과를 판정하는 데 쓰지 않는다.
2026-08-10 batching 결과의 병렬도 1.00은 응답을 항목 단위로 센 집계 오류일 수 있으므로 그 결과를 스킬 효과 판단에 쓰지 않는다.
결과를 보고할 때는 직접 측정한 값, 도구가 보고한 값, 추론한 값을 구분하고 스킬이 점수를 낮춘 사례도 함께 남긴다.

## 한계

표본이 작다. `--reps 2`면 조건당 두 번이고, 이 정도로는 모델의 실행 간 분산과 스킬
효과를 가르지 못한다. 방향을 보는 용도이지 통계적 결론을 내는 용도가 아니다.

지표는 전부 대리 측정이다. 정규식은 문장의 질을 모르고, 병렬도는 그 묶음이 적절했는지
모르며, 게이트 지표는 명령 문자열의 표면만 본다. 숫자가 갈리는 실행이 나오면 전사를
직접 읽어야 한다.

자동 과제(`run.mjs`·`score.mjs`)의 채점기는 모델 판정을 쓰지 않고 여전히 대리 지표만 센다.
모델 판정은 `behavior.mjs`의 행동 평가에만 쓰고, 그때도 생성자는 기준을 모르고 판정자는 조건을 모르는 블라인드 방식으로 돌린다.
블라인드로 돌려도 채점자 편향과 판정 비용은 남는다.
그래서 행동 평가의 점수도 차이가 있는지 보는 신호로만 읽고, 갈린 항목은 응답을 직접 읽어 확인한다.
