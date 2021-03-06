import { Controller, Get, Param, Query } from '@nestjs/common';
import { GameService } from './game.service';

@Controller('games')
export class GameController {
  constructor(private gameService: GameService) {}

  @Get('gamelists/by-nickname/:nickname')
  async findAll(
    @Param('nickname') nickname: string,
    @Query('page') page: number,
    @Query('item') item: number,
  ) {
    const record = await this.gameService.findAll(nickname, page, item);
    return record;
  }

  @Get(':userId')
  async getScore(@Param('userId') userId: number) {
    return await this.gameService.getScore(userId);
  }
}
