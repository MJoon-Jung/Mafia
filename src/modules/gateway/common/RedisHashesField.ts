export class RedisHashesField {
  public static day() {
    return 'day';
  }
  public static vote(day: number) {
    return `vote:${day}`;
  }
  public static punish(day: number) {
    return `punish:${day}`;
  }
  public static punishPlayer(day: number) {
    return `punishPlayer:${day}`;
  }
  public static turn() {
    return 'turn';
  }
  public static player() {
    return 'player';
  }
  public static joinCount() {
    return 'joinCount';
  }
  public static startCount() {
    return 'startCount';
  }
  public static member() {
    return 'member';
  }
  public static roomInfo() {
    return 'roomInfo';
  }
  public static mafiaSKill(day: number) {
    return `mafiaSkill:${day}`;
  }
  public static doctorSkill(day: number) {
    return `doctorSkill:${day}`;
  }
  public static policeSkill(day: number) {
    return `policeSkill:${day}`;
  }
}
