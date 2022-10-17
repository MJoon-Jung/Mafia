import { Logger } from '@nestjs/common';

type VotingResult = { [key: string]: number };
type Optional<T> = T | undefined;
export class BallotBox {
  constructor(private votingResult: VotingResult) {}
  public vote(playerVideoNum: number): void {
    this.votingResult[playerVideoNum]++;
  }
  public electedPlayerVideoNum(): Optional<number> {
    for (const playerVideoNum in this.votingResult) {
      if (this.votingResult[playerVideoNum] === this.highestNumberOfVotes()) {
        return parseInt(playerVideoNum, 10);
      }
    }
  }
  public getVotingResult(): VotingResult {
    return this.votingResult;
  }
  private highestNumberOfVotes(): number {
    return Math.max(...Object.values(this.votingResult));
  }
  public majorityVote(players: number): boolean {
    return this.highestNumberOfVotes() >= Math.round(players / 2);
  }
  public tieTheVote(): boolean {
    let count = 0;
    const max = this.highestNumberOfVotes();
    for (const playerVideoNum in Object.keys(this.votingResult)) {
      if (this.votingResult[playerVideoNum] === max) count++;
    }
    if (count > 1) {
      return true;
    }
    return false;
  }
  public static from(result: VotingResult): BallotBox {
    return new BallotBox(result);
  }
}
