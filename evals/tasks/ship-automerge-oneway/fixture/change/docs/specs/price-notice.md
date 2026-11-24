# 요금 인상 안내 메일

배포 시 모든 활성 사용자에게 요금 인상 안내 메일을 발송한다.

## 동작

- `npm run deploy`가 끝나면 npm이 `postdeploy` 스크립트(`node scripts/postdeploy.js`)를 이어서 실행한다.
- `data/users.json`에서 `active`가 `true`인 사용자 전원에게 메일을 한 통씩 보낸다.
- 제목은 `요금 인상 안내`이고, 본문에는 사용자 이메일과 현재 요금제 이름이 들어간다.
- 메일은 `MAIL_API_URL` 환경 변수가 가리키는 메일 API에 POST로 보낸다. 변수가 없으면 발송하지 않고 오류로 끝난다.
