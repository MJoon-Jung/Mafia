import { WsException } from '@nestjs/websockets';
import { GameWsExceptionMessage } from 'src/modules/gateway/game/exception/GameWsExceptionMessage';

export class ForbiddenMafiaSkillException extends WsException {
  constructor() {
    super(GameWsExceptionMessage.FORBIDDEN_MAFIA_SKILL);
  }
}
