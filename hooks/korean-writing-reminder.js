#!/usr/bin/env node
// PostToolUse(Write|Edit): 한국어 작성 감지 시 korean-chat / korean-docs 점검 리마인드 주입
// 컨텍스트 비용 억제를 위해 세션당 10분 디바운스
// 의존성 없음 — plain node 만으로 동작한다
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEBOUNCE_MS = 10 * 60 * 1000;

let data;
try {
  data = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const toolInput = data.tool_input || {};
const text = [toolInput.content, toolInput.new_string].filter(Boolean).join('\n');
const filePath = toolInput.file_path || '';

// 설정·메모리 파일은 검사 대상이 아니다
if (/\/\.claude\//.test(filePath) || /\/memory\//.test(filePath)) process.exit(0);
if (!/[가-힣]/.test(text)) process.exit(0);

// session_id 는 외부 입력이므로 파일명으로 쓰기 전에 정규화한다
const sessionKey = String(data.session_id || 'default').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
const marker = path.join(os.tmpdir(), `korean-writing-reminder-${sessionKey}`);
try {
  if (Date.now() - fs.statSync(marker).mtimeMs < DEBOUNCE_MS) process.exit(0);
} catch {}
try {
  fs.writeFileSync(marker, '');
} catch {}

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        '한국어 작성 점검 — 의미와 근거 보존, 독자에게 필요한 설명, 자연스러운 말투, 간결함 순으로 확인합니다. 채팅·메시지는 korean-chat을 적용해 일반 대화에는 존댓말을 쓰고, 보고·메모의 명사형은 사용자 요청이나 해당 산출물의 정해진 형식에 맞춥니다. 낯선 개념을 묻는 짧은 질문에도 필요한 이유와 예시는 설명합니다. 문서는 korean-docs를 적용해 독자 배경에 맞는 완결 산문으로 쓰고, 한 문단에 주장 하나와 산문 문장별 소스 줄바꿈을 지킵니다. 번역투·이중 피동·상투어는 문맥에서 판단하며 자연스러운 표현을 금지어처럼 삭제하지 않습니다. 조건·불확실성·부정·수치·단위·코드·정확한 오류와 확인된 작업 상태를 보존합니다. 문서 커밋 전에는 독자 관점과 언어 품질을 각각 검토합니다.',
    },
  }),
);
