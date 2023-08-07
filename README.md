## 프로젝트: Fafia(Face + Mafia)
- 웹에서 서로의 얼굴을 보면서 플레이하는 마피아 게임입니다.
- 서비스에서 사회자 역할을 대신하여 게임을 진행합니다.
- 게임 진행 중 플레이어 지목할 때 생동감을 살리기 위해 카메라 인식을 도입하여 직접 손을 움직여 플레이합니다.
- 상대방의 직업을 메모할 수 있는 기능을 이용하면 다른 플레이어의 의심되는 직업 필터를 설정할 수 있습니다.
- 오프라인에서는 밤(게임 턴)에 다른 사람의 소리가 들리는 불편한 점을 해소했습니다.

Frontend Repository<br/>
- https://github.com/Mirai1412/Capstone-Front

Backend Repository<br/>
- https://github.com/MJoon-Jung/Mafia.git

### 사용 기술
```
TypeScript, JavaScript
nuxt.js, nest.js, socket.io
mediapipe, tensorflow.js
MySQL, redis
AWS, Docker, Github, Github Actions
```
<br/>

1. 프로젝트 준비 <br/> 

mysql, redis, env 셋팅
```
git clone https://github.com/MJoon-Jung/Mafia.git
cd ./Mafia
cp .env.example .env.development
```

2. 설치
```
npm install
```

3. 데이터베이스 초기 데이터 셋팅
```
npm run seed:run
```

4. 서버 시작
```
npm run start
```

### 인프라 구조/배포 자동화
![infra](https://github.com/MJoon-Jung/Mafia/assets/73692837/3b6e5c99-314a-4e48-a88d-5e10b9028778)

### 게임 시퀀스 다이어그램

```mermaid
sequenceDiagram
  autonumber
  actor B as client
  participant C as server
  participant D as database
  B->>C: game:join 소켓 룸 참가 신청 { roomId: number}
  C-->>B: 마지막 플레이어까지 join 했을 때 game:join emit(job, status, day 초기화)
  B->>C: game:start 게임 시작 대기 신청
  C->>D: 역할 분배 후 player 정보 저장 및 status 초기화
  B->>C: 플레이어 game:start emit
  C-->>B: game:start 플레이어 개인마다 { players: Player[] } 즉시 응답
  C->>B: 5초 후 타이머 시작 game:timer { timer: number, status: 'MEETING', day: number } (status: MEETING, VOTE, PUNISHMENT, NIGHT)
	B->>C: 처형 or 밤 이벤트 발생
  C->>B: 승리 조건 만족 시 game:end { win: 'MAFIA' or 'CITIZEN', message: '시민팀이 승리하였습니다.' or '마피아팀이 승리하였습니다.' }
```

```mermaid
sequenceDiagram
  autonumber
  actor B as client
  participant C as server
  alt if timer 진행 중
    alt if status==VOTE
      B->>C: game:vote { playerVideoNum: number }
    end
    alt if status==PUNISH
      B->>C: game:punish { agree: boolean } (true: 죽이는거 엄지 아래 방향)
    end
    alt if status==NIGHT
      alt if job=='MAFIA' or 'DOCTOR'
        B->>C: game:(mafia or doctor) { playerVideoNum: number }
      end
      alt if job=='POLICE'
        B->>+C: game:police { playerVideoNum: number }
        C-->>-B: game:police { player: Player,message: 'OO님의 역할은 마피아입니다.'}
      end
    end
  end
```

```mermaid
sequenceDiagram
  autonumber
  actor B as client
  participant C as server
  alt if timer가 0초가 되었을 때
    C->>C: status 확인
    alt if status==VOTE
      C->>B: game:vote { playerVideNum: number | null, message: 'OO님이 과반수 이상의 투표를 받았습니다.' or '투표가 부결되었습니다.', } 
			alt if 과반수 이상의 지목O
				C->>C: status PUNISH으로 변경
			else if 과반수 이상의 지목X
				C->>C: status NIGHT로 변경
			end
    end
    alt if status==PUNISH
      C->>B: game:punish { playerVideoNum: number | null, result: boolean, message: '처형당한 플레이어는 마피아였습니다.' or '처형당한 플레이어는 마피아가 아니었습니다.' }
      alt if 처형 == true
        C->>C: 승리조건 검사
      end
			C->>C: status NIGHT로 변경
    end
    alt if status==NIGHT
      alt if 마피아가 아무도 고르지 않았을 때 
        C->>B: game:skill { die: false, playerVideoNum: null, message: '평화로운 밤이었습니다.' }
      else if 의사가 살렸을 때
        C->>B: game:skill { die: false, playerVideoNum: null, message: '의사가 ㅁㅁ님을 살렸습니다.' }
      else if 의사가 살리지 못했을 때 
        C->>B: game:skill { die: true, playerVideoNum: number, message: '마피아가 ㅁㅁ님을 죽였습니다.' }
        C->>C: 승리조건 검사
      end
    end
  end
  C->>C: status MEET으로 변경 및 타이머 재실행
```
