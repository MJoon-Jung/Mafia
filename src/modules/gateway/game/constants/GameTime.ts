export class GameTime {
  public static readonly MEETING_TIME = +process.env.MEETING_TIME || 60;
  public static readonly VOTE_TIME = +process.env.VOTE_TIME || 60;
  public static readonly PUNISH_TIME = +process.env.PUNISH_TIME || 60;
  public static readonly NIGHT_TIME = +process.env.NIGHT_TIME || 60;
}
