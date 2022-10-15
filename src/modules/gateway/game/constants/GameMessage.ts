export class GameMessage {
  public static PUNISH_RESULT_MAFIA(): string {
    return '처형당한 플레이어는 마피아였습니다.';
  }
  public static PUNISH_RESULT_CITIZEN(): string {
    return '처형당한 플레이어는 마피아가 아니었습니다.';
  }
  public static PUNISH_NOT_MAJORITY(): string {
    return '사형 찬반 투표가 부결되었습니다.';
  }
  public static VOTE_RESULT_MAJORITY(nickname: string): string {
    return `플레이어 지목 투표 결과 ${nickname}님이 과반수 이상입니다.`;
  }
  public static VOTE_RESULT_TIE(): string {
    return '플레이어 지목 투표 결과 동률입니다.';
  }
  public static VOTE_RESULT_NOT_MAJORITY(): string {
    return '플레이어 지목 투표 결과 부결되었습니다.';
  }
  public static NIGHT_NOT_SKILL(): string {
    return '평화로운 밤이었습니다.';
  }
  public static NIGHT_DOCTOR_SKILL(nickname: string): string {
    return `의사가 ${nickname}님을 마피아의 능력으로부터 지켰습니다.`;
  }
  public static NIGHT_MAFIA_SKILL(nickname: string): string {
    return `마피아에게 ${nickname}님이 살해당했습니다.`;
  }
  public static NIGHT_POLICE_SKILL(nickname: string, job: string): string {
    return `${nickname}님의 역할은 ${job}입니다.`;
  }
}
