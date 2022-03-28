import {
  Controller,
  Post,
  Body,
  UseGuards,
  Param,
  Delete,
  Get,
  Sse,
  MessageEvent,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import { CreateGameRoomDto } from './dto/create-game-room.dto';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LoggedInGuard } from '../auth/guards/logged-in.guard';
import { UserDecorator } from 'src/decorators/user.decorator';
import { UserProfile } from '../user/dto';
import { Member } from 'src/modules/game-room/dto';
import {
  GameRoomInfo,
  GameRoomInfoWithGameMembers,
  GameRoomInfoWithMemberCount,
  ResponseCurrentGamesInfo,
  ResponseGameInfoWithGameMembersDto,
  ResponseGameInfoWithMemberCountDto,
  UpdateGameRoomDto,
} from './dto';
import { ResponseDto } from 'src/common/dto';
import {
  ExistGameRoomGuard,
  GameMemberGuard,
  ValidateLimitGuard,
} from './guards';
import { concatMap, from, interval, map, Observable } from 'rxjs';
import { IsGameRoomMemberGuard } from './guards/is-game-room-member.guard';
import { GameRoomEventService } from '../gateway/game-room/game-room-event.service';

@ApiCookieAuth('connect.sid')
@UseGuards(LoggedInGuard)
@ApiTags('Rooms')
@Controller('games/rooms')
export class GameRoomController {
  constructor(private readonly gameRoomEventService: GameRoomEventService) {}

  @ApiResponse({
    description: '5초마다 게임 방 정보 최신화해서 보내 줌',
    type: ResponseCurrentGamesInfo,
  })
  @Sse('sse')
  sse(): Observable<MessageEvent> {
    return interval(5000)
      .pipe(
        concatMap(() =>
          from(this.gameRoomEventService.findAllOfGameRoomInfo()),
        ),
      )
      .pipe(map((response) => ({ data: response })));
  }

  @ApiOkResponse({
    description: '전체 게임 방 불러오기 성공',
    type: ResponseGameInfoWithMemberCountDto,
  })
  @ApiOperation({ summary: '전체 게임 방 불러오기' })
  @Get()
  async findAll(): Promise<GameRoomInfoWithMemberCount[]> {
    return await this.gameRoomEventService.findAllOfGameRoomInfo();
  }

  @ApiOkResponse({
    description: '게임 방 정보와 멤버 정보 불러오기 성공',
    type: ResponseGameInfoWithGameMembersDto,
  })
  @ApiParam({
    name: 'gameRoomNumber',
    description: '게임 방 번호',
    example: 1,
  })
  @ApiOperation({ summary: '특정 게임 방 정보 불러오기 ' })
  @Get(':gameRoomNumber')
  async findUsersInGameRoomWithRoomInfo(
    @Param('gameRoomNumber') gameRoomNumber: string,
  ): Promise<GameRoomInfoWithGameMembers> {
    return await this.gameRoomEventService.mergeGameRoomInfoAndMembers({
      gameRoomNumber: +gameRoomNumber,
    });
  }

  @ApiCreatedResponse({
    description: '게임 방 생성 성공',
    type: ResponseGameInfoWithGameMembersDto,
  })
  @ApiBadRequestResponse({
    description: '최대 인원 수 설정 실패',
    schema: {
      example: new ResponseDto(
        false,
        HttpStatus.BAD_REQUEST,
        '잘못된 게임 최대 인원 수 설정',
      ),
    },
  })
  @ApiBody({
    description: '방 생성 시 필요한 정보',
    type: CreateGameRoomDto,
  })
  @ApiOperation({ summary: '게임 방 생성' })
  @UseGuards(ValidateLimitGuard)
  @Post()
  async create(
    @Body() createGameDto: CreateGameRoomDto,
    @UserDecorator() user: UserProfile,
  ): Promise<GameRoomInfo> {
    console.log(user);
    return await this.gameRoomEventService.create(
      createGameDto,
      new Member(user.profile),
    );
  }

  @ApiCreatedResponse({
    description: '게임 방 참가 성공',
    type: ResponseGameInfoWithGameMembersDto,
  })
  @ApiForbiddenResponse({
    description: '게임 방 참가 실패',
    schema: {
      example: new ResponseDto(
        false,
        HttpStatus.FORBIDDEN,
        '게임 참여할 권한이 없습니다',
      ),
    },
  })
  @ApiParam({
    name: 'gameRoomNumber',
    description: '게임 방 번호',
    example: 1,
  })
  @ApiOperation({ summary: '게임 방 참가' })
  @UseGuards(ExistGameRoomGuard, IsGameRoomMemberGuard)
  @Post(':gameRoomNumber')
  async join(
    @Param('gameRoomNumber') gameRoomNumber: string,
    @UserDecorator() user: UserProfile,
  ): Promise<object> {
    return await this.gameRoomEventService.join(+gameRoomNumber);
  }

  @ApiCreatedResponse({
    description: '게임 방 생성 성공',
    type: ResponseGameInfoWithGameMembersDto,
  })
  @ApiBadRequestResponse({
    description: '최대 인원 수 설정 실패',
    schema: {
      example: new ResponseDto(
        false,
        HttpStatus.BAD_REQUEST,
        '잘못된 게임 최대 인원 수 설정',
      ),
    },
  })
  @ApiBody({
    description: '방 생성 시 필요한 정보',
    type: CreateGameRoomDto,
  })
  @ApiOperation({ summary: '게임 방 생성' })
  @UseGuards(ValidateLimitGuard)
  @Patch(':gameRoomNumber')
  async update(
    @Body() updateGameDto: UpdateGameRoomDto,
    @UserDecorator() user: UserProfile,
    @Param('gameRoomNumber') gameRoomNumber: string,
  ): Promise<void> {
    return await this.gameRoomEventService.update(
      +gameRoomNumber,
      updateGameDto,
      user.id,
    );
  }
  @ApiOkResponse({
    description: '게임 방 나가기 성공',
    schema: {
      example: new ResponseDto(true, HttpStatus.OK, {
        gameRoomNumber: 1,
        exit: true,
      }),
    },
  })
  @ApiParam({
    name: 'gameRoomNumber',
    description: '게임 방 번호',
    example: 1,
  })
  @ApiOperation({
    summary: '게임 방 나가기 (나가는 사람이 마지막 사람이면 자동 방 파괴',
  })
  @UseGuards(ExistGameRoomGuard, GameMemberGuard)
  @Delete(':gameRoomNumber/users/me')
  async leaveGameRoom(
    @Param('gameRoomNumber') gameRoomNumber: string,
    @UserDecorator() user: UserProfile,
  ): Promise<object> {
    return this.gameRoomEventService.leave(+gameRoomNumber, user.id);
  }

  @ApiOkResponse({
    description: '게임 방 삭제 성공',
    schema: {
      example: new ResponseDto(true, HttpStatus.OK, {
        gameRoomNumber: 1,
        delete: true,
      }),
    },
  })
  @ApiParam({
    name: 'gameRoomNumber',
    description: '게임 방 번호',
    example: 1,
  })
  @ApiOperation({ summary: '게임 방 삭제 (게임 끝났을 경우 이 경로)' })
  @UseGuards(ExistGameRoomGuard, GameMemberGuard)
  @Delete(':gameRoomNumber')
  async removeGame(
    @Param('gameRoomNumber') gameRoomNumber: string,
  ): Promise<object> {
    return await this.gameRoomEventService.remove(+gameRoomNumber);
  }
}
