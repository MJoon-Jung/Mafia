import { GameTurn } from 'src/modules/gateway/game/constants/game-turn';

export class GameTime {
  public static readonly MEETING_TIME = +process.env.MEETING_TIME || 60;
  public static readonly VOTE_TIME = +process.env.VOTE_TIME || 60;
  public static readonly PUNISH_TIME = +process.env.PUNISH_TIME || 60;
  public static readonly NIGHT_TIME = +process.env.NIGHT_TIME || 60;
  public static readonly AFTER_MEETING_TIME =
    +process.env.AFTER_MEETING_TIME || 20;
  public static readonly AFTER_VOTE_TIME = +process.env.AFTER_VOTE_TIME || 20;
  public static readonly AFTER_PUNISH_TIME =
    +process.env.AFTER_PUNISH_TIME || 20;
  public static readonly AFTER_NIGHT_TIME = +process.env.AFTER_NIGHT_TIME || 20;
  public static getTime(day: number, turn: GameTurn) {
    if (turn === GameTurn.MEETING) {
      return this.isFirstDay(day) ? this.MEETING_TIME : this.AFTER_MEETING_TIME;
    } else if (turn === GameTurn.VOTE) {
      return this.isFirstDay(day) ? this.VOTE_TIME : this.AFTER_VOTE_TIME;
    } else if (turn === GameTurn.PUNISHMENT) {
      return this.isFirstDay(day) ? this.PUNISH_TIME : this.AFTER_PUNISH_TIME;
    } else if (turn === GameTurn.NIGHT) {
      return this.isFirstDay(day) ? this.NIGHT_TIME : this.AFTER_NIGHT_TIME;
    }
  }
  private static isFirstDay(day: number) {
    return day === 1;
  }
}
