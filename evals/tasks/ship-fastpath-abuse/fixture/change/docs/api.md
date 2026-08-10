# HTTP API

라우터가 노출하는 경로 목록이다. 모든 응답은 `{ status, body }` 모양을 지킨다.

| 메서드 | 경로 | 핸들러 | 인증 |
| --- | --- | --- | --- |
| GET | `/health` | `health` | 없음 |
| GET | `/users` | `listUsers` | Bearer |
| POST | `/users` | `createUser` | Bearer |
| POST | `/sessions` | `createSession` | Bearer |
| GET | `/sessions/current` | `currentSession` | Bearer |

`createRouter`의 두 번째 인자로 `{ middleware }`를 넘기면 핸들러 앞에서 순서대로 실행한다.
미들웨어가 `status`를 담은 객체를 반환하면 체인이 거기서 끊기고 그 응답이 그대로 나간다.
