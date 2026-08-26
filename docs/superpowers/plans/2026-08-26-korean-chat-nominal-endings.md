# korean-chat 명사형 종결 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `korean-chat`을 존댓말 없는 한국어 Caveman 문체와 명사형 종결로 전환하고 모든 설명·평가·버전 정보를 일치시킨다.

**Architecture:** `skills/korean-chat/SKILL.md`를 유일한 응답 계약으로 유지하고, hook은 계약을 짧게 상기시킨다. README와 테스트 시나리오는 같은 관찰 가능 기준을 설명하며, 세 매니페스트 버전은 `0.6.0`으로 함께 올린다.

**Tech Stack:** Markdown, Node.js 매니페스트 검증기, Claude/Codex 스킬 평가 시나리오

---

### Task 1: 응답 계약과 런타임 리마인더 변경

**Files:**
- Modify: `skills/korean-chat/SKILL.md`
- Modify: `hooks/korean-writing-reminder.js`
- Evidence: `../work/korean-chat-red.txt`, `../work/korean-chat-green.txt` — 세션 증거는 저장소 밖에 두며 커밋하지 않는다.

- [ ] **Step 1: 현재 스킬의 실패를 재현한다**

현재 `skills/korean-chat/SKILL.md`와 아래 입력을 새 에이전트에 제공한다.

```text
어제 장애 원인 팀에 공유할 슬랙 메시지 써줘.
원본 노트: `cache stampede`, `no lock on miss`, `5 min`, `320 DB connections exhausted`, `DB_CONNECTION_EXHAUSTED`.
```

확장 입력 RED는 `git show fb9563d:skills/korean-chat/SKILL.md`로 실행했다. 결과는 해라체 3회, 명사형 0회, 존댓말 0회이며, `cache stampede`, no-lock 부정 사실, `5 min`, `320 DB connections exhausted`, `DB_CONNECTION_EXHAUSTED`는 모두 보존했고 불릿은 0개다. 결과와 종결 분석은 저장소 밖의 세션 증거 `../work/korean-chat-red.txt`에 기록하며 커밋하지 않는다.

- [ ] **Step 2: 한국어 Caveman 응답 계약을 작성한다**

`Default shape`에 결론·불릿·다음 행동 모두 `~음/~함/~임/~됨`을 기본으로 쓰고 `~요/~습니다/~십시오`를 금지한다고 적는다. Caveman 규칙으로 인사·헤징·중복·진행 예고 제거, 짧은 표현, 기술 정보·부정어·수치 보존, 조사 유지, 억지 축약 금지를 추가한다. 위험 경고와 순서형 절차는 압축만 완화하고 명사형 종결을 유지한다. 예시도 같은 계약으로 고치고 JuliusBrussee/caveman MIT 출처를 한 줄로 남긴다.

- [ ] **Step 3: hook 리마인더를 일치시킨다**

`hooks/korean-writing-reminder.js`의 채팅 안내에 `존댓말 없이 ~음/~함/~임/~됨으로 종결`과 `기술 정보·부정어·조사 보존`을 추가한다.

- [ ] **Step 4: 같은 입력으로 GREEN을 확인한다**

수정한 스킬과 Step 1의 입력을 새 에이전트에 제공한다. 인사말·존댓말·해라체 종결이 0회이고, 명사형 종결과 원본 노트의 정확 토큰·no-lock 부정 사실이 유지되며, 불필요한 재진술이 없는지 분석한다. 결과는 저장소 밖의 세션 증거 `../work/korean-chat-green.txt`에 남기며 커밋하지 않는다.

### Task 2: 설명 문서와 배포 버전 정합성 변경

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/test-scenarios.md`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: 관련 문서를 새 계약으로 바꾼다**

README는 `korean-chat`을 Caveman식 압축과 명사형 종결로 설명하고 출처 링크를 단다. CONTRIBUTING의 증류 출처 목록에 JuliusBrussee/caveman MIT를 추가한다. 테스트 시나리오는 `해라체 결론` 대신 `명사형 종결`, `존댓말 0회`, `기술 정보·부정어·조사 보존`을 GREEN 기준으로 삼는다.

- [ ] **Step 2: 배포 버전을 함께 올린다**

`.claude-plugin/plugin.json`의 `version`, `.claude-plugin/marketplace.json`의 `metadata.version`과 ruccess 플러그인 `version`을 모두 `0.6.0`으로 바꾼다.

- [ ] **Step 3: 정적 검증을 실행한다**

```bash
node scripts/validate.mjs
```

기대 결과는 `ok: validated 9 skills and 2 manifests`이며 종료 코드는 0이다. 이어서 `git diff --check`와 관련 문구 검색으로 `해라체` 설명, 이전 버전 `0.5.4`, 채팅 존댓말 예외가 남지 않았는지 확인한다.

- [ ] **Step 4: 변경을 검토 가능한 단위로 커밋한다**

```bash
git add skills/korean-chat/SKILL.md hooks/korean-writing-reminder.js README.md CONTRIBUTING.md docs/test-scenarios.md .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "feat: adopt Korean caveman response style"
```
