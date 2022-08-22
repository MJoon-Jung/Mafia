import { ApiProperty } from '@nestjs/swagger';
import { Player } from 'src/modules/game-room/dto/player';

export class Voting {
  @ApiProperty({
    example: 1,
    description: '프로필 고유 ID',
  })
  id: number;

  @ApiProperty({
    example: 'gjgjajaj',
    description: '닉네임',
  })
  nickname: string;

  @ApiProperty({
    example: 1,
    description: '유저 ID',
  })
  userId: number;

  @ApiProperty({
    example: false,
    description: '플레이어 투표 유무',
  })
  vote: boolean;

  constructor(player: Player) {
    this.id = player.id;
    this.nickname = player.nickname;
    this.userId = player.userId;
    this.vote = false;
  }
}
