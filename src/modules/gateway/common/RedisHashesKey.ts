export class RedisHashesKey {
  public static room(roomId: number): string {
    return `gameroom:${roomId}`;
  }
  public static game(roomId: number): string {
    return `game:${roomId}`;
  }
  public static allRoom(): string {
    return 'gameroom*';
  }
}
