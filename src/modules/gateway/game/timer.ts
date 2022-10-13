import { GameTurn } from 'src/modules/gateway/game/constants/game-turn';
import { GameEventService } from 'src/modules/gateway/game/game-event.service';

type Optional<T> = T | undefined;

export abstract class Timer {
  protected readonly baseTime: number;
  protected _turn: GameTurn;
  constructor(protected gameEventService: GameEventService, baseTime?: number) {
    this.baseTime = baseTime || 60;
  }
  public static create(
    gameEventService: GameEventService,
    turn: GameTurn,
    baseTime?: number,
  ): Timer {
    if (turn === GameTurn.MEETING) {
      return new MeetTimer(gameEventService, baseTime);
    } else if (turn === GameTurn.VOTE) {
      return new VoteTimer(gameEventService, baseTime);
    } else if (turn === GameTurn.PUNISHMENT) {
      return new PunishTimer(gameEventService, baseTime);
    } else if (turn === GameTurn.NIGHT) {
      return new NightTimer(gameEventService, baseTime);
    }
  }
  protected abstract init(): Promise<void>;
  protected abstract finally(): Promise<void>;
  public abstract start(): Promise<void>;
  public getTurn(): Optional<GameTurn> {
    return this._turn;
  }

  public setTurn(turn: GameTurn): void {
    this._turn = turn;
  }
  // protected getGameEventService(): GameEventService {
  //   return this.gameEventService;
  // }
}

class MeetTimer extends Timer {
  constructor(gameEventService: GameEventService, baseTime?: number) {
    super(gameEventService, baseTime);
  }
  protected async init(): Promise<void> {
    /**
     * 처음 시작할 때 저녁에 투표 값을 확인 후 시작해야한다.
     * 만약 init에서 flag가 생긴다면 타이머를 진행하지 않고 끝내야함
     * 근데 이게 타이머가 해야할 일인가?
     */
  }
  protected async finally(): Promise<void> {
    /**
     * status 바꾸고 다음 타이머 실행해줘야함
     */
  }
  public async start(): Promise<void> {
    await this.init();
    let time = this.baseTime;
    setTimeout(async function run() {
      if (time-- >= 0) setTimeout(run, 1000);
      else await this.finally();
    }, 1000);
  }
}
class VoteTimer extends Timer {
  constructor(gameEventService: GameEventService, baseTime?: number) {
    super(gameEventService, baseTime);
  }
  protected async init(): Promise<void> {}
  protected async finally(): Promise<void> {
    /**
     * 투표 총 합계 낸 후 status 변경
     */
  }
  public async start(): Promise<void> {
    await this.init();
    let time = this.baseTime;
    setTimeout(async function run() {
      if (time-- >= 0) setTimeout(run, 1000);
      else await this.finally();
    }, 1000);
  }
}
class PunishTimer extends Timer {
  constructor(gameEventService: GameEventService, baseTime?: number) {
    super(gameEventService, baseTime);
  }
  protected async init(): Promise<void> {}
  protected async finally(): Promise<void> {}
  public async start(): Promise<void> {
    await this.init();
    let time = this.baseTime;
    setTimeout(async function run() {
      if (time-- >= 0) setTimeout(run, 1000);
      else await this.finally();
    }, 1000);
  }
}
class NightTimer extends Timer {
  constructor(gameEventService: GameEventService, baseTime?: number) {
    super(gameEventService, baseTime);
  }
  protected async init(): Promise<void> {}
  protected async finally(): Promise<void> {}
  public async start(): Promise<void> {
    await this.init();
    let time = this.baseTime;
    setTimeout(async function run() {
      if (time-- >= 0) setTimeout(run, 1000);
      else await this.finally();
    }, 1000);
  }
}
