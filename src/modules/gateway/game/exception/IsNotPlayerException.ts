import { WsException } from '@nestjs/websockets';
import { GameWsExceptionMessage } from 'src/modules/gateway/game/exception/GameWsExceptionMessage';

export class IsNotPlayerException extends WsException {
  constructor() {
    super(GameWsExceptionMessage.IS_NOT_PLAYER);
  }
}
