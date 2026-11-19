#!/usr/bin/env node
// UserPromptSubmit: 프롬프트에 한글이 있으면 세션당 한 번 korean-chat 기준을 상기시킨다
// 스킬 description 만으로는 일반 채팅 응답에서 스킬이 발동하지 않으므로 발동 지점을 훅으로 둔다
// 의존성 없음 — plain node 만으로 동작한다
const fs = require('fs');
const os = require('os');
const path = require('path');

let data;
try {
  data = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

if (!/[가-힣]/.test(String(data.prompt || ''))) process.exit(0);

// session_id 는 외부 입력이므로 파일명으로 쓰기 전에 정규화한다
const sessionKey = String(data.session_id || 'default').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
const marker = path.join(os.tmpdir(), `korean-chat-reminder-${sessionKey}`);
if (fs.existsSync(marker)) process.exit(0);
try {
  fs.writeFileSync(marker, '');
} catch {}

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext:
        '한국어 응답 — korean-chat 기준을 적용합니다. 답이나 바로 할 행동을 먼저 쓰고, 의미와 근거, 독자에게 필요한 설명, 자연스러운 말투, 간결함 순으로 점검합니다. 인사·빈 서두·결론 반복은 빼고 조건·불확실성·부정·수치·코드·정확한 오류는 보존합니다. 말투는 사용자나 세션 지침이 정한 것이 우선이고, 없으면 스킬의 기본값을 따릅니다. 스킬 본문을 아직 읽지 않았다면 korean-chat 스킬을 불러 확인합니다.',
    },
  }),
);
