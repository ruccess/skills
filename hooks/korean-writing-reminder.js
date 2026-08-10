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
        '한국어 텍스트 작성 감지 — 문장 규칙을 점검하라: 번역투(~에 대해/~을 통해/~에 있어서), 이중 피동(되어진다), "가지고 있다", 과도한 쉼표, AI 상투어(핵심적·효과적·혁신적). 채팅·메시지는 korean-chat, 문서 산출물은 korean-docs 스킬 기준을 따르고, 문서 커밋 전에는 korean-docs 검수 파이프라인을 실행하라.',
    },
  }),
);
