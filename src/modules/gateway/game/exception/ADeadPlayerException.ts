import { WsException } from '@nestjs/websockets';
import { GameWsExceptionMessage } from 'src/modules/gateway/game/exception/GameWsExceptionMessage';

export class ADeadPlayerException extends WsException {
  constructor() {
    super(GameWsExceptionMessage.A_DEAD_PLAYER);
  }
}
