export class RedisHashesKey {
  public static room(roomId: number) {
    return `gameroom:${roomId}`;
  }
  public static game(roomId: number) {
    return `game:${roomId}`;
  }
  public static allRoom() {
    return 'gameroom*';
  }
}
