import { WsException } from '@nestjs/websockets';
import { GameWsExceptionMessage } from 'src/modules/gateway/game/exception/GameWsExceptionMessage';

export class ForbiddenPoliceSkillException extends WsException {
  constructor() {
    super(GameWsExceptionMessage.FORBIDDEN_POLICE_SKILL);
  }
}
