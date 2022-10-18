import { WsException } from '@nestjs/websockets';
import { GameWsExceptionMessage } from 'src/modules/gateway/game/exception/GameWsExceptionMessage';

export class ForbiddenDoctorSkillException extends WsException {
  constructor() {
    super(GameWsExceptionMessage.FORBIDDEN_DOCTOR_SKILL);
  }
}
