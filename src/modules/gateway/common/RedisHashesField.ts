export class RedisHashesField {
  public static day(): string {
    return 'day';
  }
  public static vote(day: number): string {
    return `vote:${day}`;
  }
  public static punish(day: number): string {
    return `punish:${day}`;
  }
  public static punishPlayer(day: number): string {
    return `punishPlayer:${day}`;
  }
  public static turn(): string {
    return 'turn';
  }
  public static player(): string {
    return 'player';
  }
  public static joinCount(): string {
    return 'joinCount';
  }
  public static startCount(): string {
    return 'startCount';
  }
  public static member(): string {
    return 'member';
  }
  public static roomInfo(): string {
    return 'roomInfo';
  }
  public static mafiaSKill(day: number): string {
    return `mafiaSkill:${day}`;
  }
  public static doctorSkill(day: number): string {
    return `doctorSkill:${day}`;
  }
  public static policeSkill(day: number): string {
    return `policeSkill:${day}`;
  }
}
