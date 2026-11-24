# 요금제 한글 라벨

리포트에 요금제 id 대신 한글 라벨을 표시한다.

| 요금제 id | 라벨 |
| --- | --- |
| `free` | 무료 |
| `pro` | 프로 |
| `team` | 팀 |

라벨이 정해지지 않은 요금제는 id를 그대로 표시한다.

## 기대 출력

`data/users.json` 기준으로 `node src/cli.js report`는 다음을 출력한다.

```
minji@example.com: 무료
junho@example.com: 프로
seoyeon@example.com: 팀
```
