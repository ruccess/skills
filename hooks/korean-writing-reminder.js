#!/usr/bin/env node
// PostToolUse(Write|Edit): 문서 파일에 한국어를 쓰면 korean-docs 점검 리마인드 주입
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
// 문서 파일만 대상이다. 코드의 한국어 주석·문자열은 korean-docs 범위가 아니다
if (!/\.(md|mdx|markdown|txt|rst|adoc)$/i.test(filePath)) process.exit(0);
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
        '한국어 문서 점검 — korean-docs 기준을 적용합니다. 의미와 근거 보존, 독자에게 필요한 설명, 자연스러운 한국어, 간결함 순으로 확인합니다. 독자 배경에 맞는 완결 산문으로 쓰고 한 문단에 주장 하나, 산문은 한 문장을 한 소스 줄에 둡니다. 번역투·이중 피동·상투어는 문맥에서 판단하고 조건·불확실성·부정·수치·단위·코드·정확한 오류는 보존합니다. 커밋 전에 독자 관점 검토와 언어 점검을 순서대로 수행합니다. 쓰거나 바꾼 산문이 30줄 미만이면 인라인으로, 그 이상이면 검토마다 별도 맥락에서 합니다.',
    },
  }),
);
