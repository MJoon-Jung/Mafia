export class PunishBallotBox {
  constructor(private punishResult: number) {}
  public majorityVote(players: number) {
    return this.punishResult > Math.floor(players / 2);
  }
  public static of(punishResult: number) {
    return new PunishBallotBox(punishResult);
  }
}
