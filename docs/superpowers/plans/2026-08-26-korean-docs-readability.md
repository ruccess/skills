# korean-docs 가독성과 한국어 품질 강화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 긴 한국어 문서를 의미 단락, 문장별 소스 줄바꿈, 자연스러운 어순, 제한된 화살표로 쉽게 읽도록 `korean-docs`를 강화한다.

**Architecture:** `skills/korean-docs/SKILL.md`를 유일한 작성·검수 계약으로 유지한다. 독자 검수는 정보 구조와 레이아웃을 먼저 평가하고, 별도 한국어 편집은 자연스러운 어순과 기존 패턴 체크리스트를 평가한다. README, CONTRIBUTING, hook, 테스트 시나리오와 세 매니페스트 버전은 같은 계약을 설명한다.

**Tech Stack:** Markdown, Claude/Codex 스킬 평가 시나리오, Node.js 매니페스트 검증기

---

### Task 1: RED와 korean-docs 응답 계약

**Files:**
- Modify: `skills/korean-docs/SKILL.md`
- Modify: `hooks/korean-writing-reminder.js`
- Evidence: `../work/korean-docs-red.txt`, `../work/korean-docs-green.txt` — 저장소 밖 세션 증거이며 커밋하지 않는다.

- [ ] **Step 1: 현재 스킬의 가독성 누락을 재현한다**

`git show e150d1f:skills/korean-docs/SKILL.md`의 현재 계약을 새 에이전트에 제공하고 아래 문서를 커밋 전 검수하게 한다.

```markdown
# 내용

서비스 지연에 대해 분석한 결과 캐시 만료와 동시 요청 증가가 원인으로 확인되어졌다. 캐시 만료가 발생하면 모든 요청이 DB로 이동하고 커넥션이 고갈되며 응답 지연이 발생한다. 장애 대응팀은 재생성 락과 TTL 지터 적용을 검토하고 있다. 배포는 금요일 오후 3시에 진행할 예정이며 실패하면 이전 이미지로 롤백하고 일부 사용자에게만 문제가 생기면 기능 플래그를 끄고 정상 사용자는 계속 새 버전을 사용한다. 이 변경은 안정성과 효율성을 보장할 수 있다.
```

RED는 문장별 소스 줄바꿈, 장애 원인과 배포 계획의 의미 단락 분리, 화살표 적합성 판단 가운데 하나 이상을 누락해야 한다. 현재 스킬이 잡은 한국어 오류와 누락한 가독성 기준을 `../work/korean-docs-red.txt`에 기록한다.

- [ ] **Step 2: 정보 구조와 줄바꿈 계약을 추가한다**

`skills/korean-docs/SKILL.md`에 다음 규칙을 간결하게 넣는다.

```text
- 한 문단에 한 주장, 보통 2~4문장
- 완결 문장마다 Markdown 소스 줄바꿈, 의미가 바뀔 때만 빈 줄
- 제목만 훑어도 흐름이 보이는 구체적인 명사구 제목
- 목록은 병렬 항목, 표는 같은 필드 비교, 강조는 결정·경고에만 사용
- 저장소 포매터가 다른 줄바꿈을 강제하면 저장소 규칙 우선
```

- [ ] **Step 3: 한국어 품질과 화살표 계약을 추가한다**

한국어 편집은 문법 정확성을 기본으로 자연스러운 어순, 주어·서술어 호응, 수식 관계, 조사·시제·높임, 용어 일관성, 동사가 살아 있는 표현을 먼저 본다. 기술 용어는 첫 사용에서만 정의하고 정확한 수치·단위·경로·명령·오류는 보존한다.

화살표는 하나의 선형 관계를 최대 3~4단계로 나타낼 때만 허용한다. 일반 산문, 분기, 예외, 반복에는 쓰지 않고 목록·표·Mermaid로 바꾼다.

- [ ] **Step 4: 두 검수와 변경률 계산을 구체화한다**

독자 검수 결과는 위치, 독자 영향, 최소 수정안 순서로 기록한다. 한국어 편집은 자연스러움을 먼저 보고 기존 체크리스트를 안전망으로 쓴다. 변경률은 코드·명령·인용을 제외한 비어 있지 않은 산문 줄 중 수정할 줄의 비율이며, 30% 초과 시 적용하지 않고 계산 근거와 발견 사항만 보고한다.

hook의 문서 리마인더에는 `한 문단 한 주장`, `문장별 소스 줄바꿈`, `의미 전환 때만 빈 줄`, `짧은 선형 흐름만 →`, `자연스러운 한국어 우선`을 넣는다.

- [ ] **Step 5: 같은 입력으로 GREEN을 확인한다**

수정한 스킬과 Step 1 입력을 새 에이전트에 제공한다. GREEN은 다음을 모두 만족해야 한다.

```text
- 장애 원인과 배포 계획을 별도 제목·의미 단락으로 분리
- 같은 문단의 완결 문장마다 소스 줄바꿈 제안
- 캐시 만료 → 요청 집중 → DB 커넥션 고갈 같은 단순 인과만 화살표 후보로 제안
- 롤백과 기능 플래그 분기는 화살표로 축약하지 않음
- 확인되어졌다, ~에 대해, ~할 예정이다 같은 번역투와 호응 문제에 자연스러운 수정문 제시
- 예상 변경률이 30%를 넘으므로 직접 적용하지 않고 발견 사항과 계산 근거만 보고
```

결과를 `../work/korean-docs-green.txt`에 기록한다.

### Task 2: 설명 문서와 버전 정합성

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/test-scenarios.md`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: 관련 문서를 새 계약으로 맞춘다**

README는 의미 단락, 문장별 소스 줄바꿈, 자연스러운 한국어, 제한된 화살표, 두 단계 검수를 설명한다. CONTRIBUTING의 한국어 문서 규칙에 같은 레이아웃 원칙을 넣는다. `docs/test-scenarios.md`에는 Task 1의 fixture와 관찰 가능한 RED/GREEN 기준을 추가하고 기존 8개 패턴 검출 시나리오는 유지한다.

- [ ] **Step 2: 배포 버전을 `0.7.0`으로 올린다**

다음 세 위치만 `0.6.0`에서 `0.7.0`으로 바꾼다.

```text
.claude-plugin/plugin.json: version
.claude-plugin/marketplace.json: metadata.version
.claude-plugin/marketplace.json: plugins[].name == "ruccess"의 version
```

- [ ] **Step 3: 검증한다**

```bash
node scripts/validate.mjs
PYTHONPATH=../work/python-deps python3 /Users/2309-n0201/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/korean-docs
git diff --check
```

기대 결과는 각각 `ok: validated 9 skills and 2 manifests`, `Skill is valid!`, 출력 없음이며 모두 종료 코드 0이다. 추가 검색으로 `0.7.0`이 세 위치, `0.6.0`이 매니페스트에 0개인지 확인한다.

- [ ] **Step 4: 기능 변경을 별도 커밋으로 남긴다**

```bash
git add skills/korean-docs/SKILL.md hooks/korean-writing-reminder.js README.md CONTRIBUTING.md docs/test-scenarios.md .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "feat: prioritize Korean document readability"
```

### Task 3: main 반영 준비

- [ ] **Step 1: 전체 브랜치 범위와 검증 결과를 보고한다**

`main..HEAD` 커밋 목록에는 앞선 korean-chat 변경과 이번 korean-docs 변경이 모두 포함됨을 명시한다. 저장소·스킬·JS·JSON 검증 결과와 원격 `main`의 최신 상태를 확인한다.

- [ ] **Step 2: 보호 브랜치 승인 후 main에 반영한다**

검증 결과와 반영 커밋을 사용자에게 보고하고, `main` 병합·push 직전에 별도 승인을 받는다. 승인 전에는 `main` 체크아웃, 병합, push를 실행하지 않는다.
