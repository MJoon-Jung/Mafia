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
import {
  GameRoom,
  GameRoomWithMembers,
  Member,
  ResponseGameRoomFindAllDto,
  ResponseGameRoomFindOneDto,
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
import { ExistedProfileGuard } from 'src/common/guards';
import { GameRoomService } from './game-room.service';

@ApiCookieAuth('connect.sid')
@UseGuards(LoggedInGuard, ExistedProfileGuard)
@ApiTags('Rooms')
@Controller('games/rooms')
export class GameRoomController {
  constructor(
    private readonly gameRoomEventService: GameRoomEventService,
    private readonly gameRoomService: GameRoomService,
  ) {}

  @ApiResponse({
    description: '5초마다 게임 방 정보 최신화해서 보내 줌',
    type: ResponseGameRoomFindAllDto,
  })
  @ApiOperation({ summary: '5초마다 전체 게임 방 불러오기' })
  @Sse('sse')
  sse(): Observable<MessageEvent> {
    return interval(5000)
      .pipe(concatMap(() => from(this.gameRoomEventService.findAll())))
      .pipe(map((response) => ({ data: response })));
  }

  @ApiOkResponse({
    description: '전체 게임 방 불러오기 성공',
    type: ResponseGameRoomFindAllDto,
  })
  @ApiOperation({ summary: '전체 게임 방 불러오기' })
  @Get()
  async findAll(): Promise<GameRoomWithMembers[]> {
    return await this.gameRoomEventService.findAll();
  }

  @ApiOkResponse({
    description: '게임 방 정보와 멤버 정보 불러오기 성공',
    type: ResponseGameRoomFindOneDto,
  })
  @ApiParam({
    name: 'roomId',
    description: '게임 방 번호',
    example: 1,
  })
  @ApiOperation({ summary: '특정 게임 방 정보 불러오기 ' })
  @Get(':roomId')
  async findUsersInGameRoomWithRoomInfo(
    @Param('roomId') roomId: string,
  ): Promise<GameRoomWithMembers> {
    return await this.gameRoomEventService.mergeGameRoomInfoAndMembers(+roomId);
  }

  @ApiCreatedResponse({
    description: '게임 방 생성 성공',
    type: GameRoom,
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
    @Body() createGameRoomDto: CreateGameRoomDto,
  ): Promise<GameRoom> {
    return await this.gameRoomEventService.create(createGameRoomDto);
  }

  @ApiOperation({ summary: 'janus 요청 신경 x' })
  @Post('list')
  async getRoomList() {
    return await this.gameRoomEventService.getJanusRoomList();
  }

  @ApiOperation({ summary: 'janus 요청 신경 x' })
  @Post('list-participants/:room')
  async getListParticipants(@Param('room') room: number) {
    return await this.gameRoomEventService.getJanusRoomListParticipants(room);
  }

  @ApiOperation({ summary: 'janus 요청 신경 x' })
  @Post('list-forwarders/:room')
  async getListForwarders(@Param('room') room: number) {
    return await this.gameRoomEventService.getJanusRoomListForwarders(room);
  }

  @ApiOperation({ summary: 'janus 요청 신경 x' })
  @Post(':room')
  async join(@Param('room') room: number, @UserDecorator() user: UserProfile) {
    return await this.gameRoomEventService.join(room, new Member(user.profile));
  }
  @ApiOkResponse({
    description: '게임 방 참가 가능',
    schema: {
      example: new ResponseDto(true, 200, { roomId: 1, joinable: true }),
    },
  })
  @ApiForbiddenResponse({
    description: '게임 방 참가 권한 불가',
    schema: {
      example: new ResponseDto(
        false,
        HttpStatus.FORBIDDEN,
        '게임 참여할 권한이 없습니다',
      ),
    },
  })
  @ApiParam({
    name: 'roomId',
    description: '게임 방 번호',
    example: 1,
  })
  @ApiOperation({ summary: '게임 방 참가 가능 여부' })
  @UseGuards(ExistGameRoomGuard, IsGameRoomMemberGuard)
  @Get(':roomId/joinable-room')
  async joinable(@Param('roomId') roomId: string): Promise<object> {
    return await this.gameRoomEventService.joinable(+roomId);
  }

  @ApiOkResponse({
    description: '게임 방 참가 가능',
    schema: {
      example: new ResponseDto(true, 200, { roomId: 1, joinable: true }),
    },
  })
  @ApiForbiddenResponse({
    description: '게임 방 참가 권한 불가',
    schema: {
      example: new ResponseDto(
        false,
        HttpStatus.FORBIDDEN,
        '게임 참여할 권한이 없습니다',
      ),
    },
  })
  @ApiForbiddenResponse({
    description: '게임 방 참가 권한 불가',
    schema: {
      example: new ResponseDto(
        false,
        HttpStatus.FORBIDDEN,
        '비밀번호가 틀렸습니다',
      ),
    },
  })
  @ApiBody({
    description: '비밀번호',
    schema: {
      example: { pin: '1234' },
    },
  })
  @ApiParam({
    name: 'roomId',
    description: '게임 방 번호',
    example: 1,
  })
  @ApiOperation({ summary: '게임 방 비밀번호 확인' })
  @UseGuards(ExistGameRoomGuard, IsGameRoomMemberGuard)
  @Post('/check-password/:roomId')
  async checkPassword(
    @Param('roomId') roomId: number,
    @Body() body: { pin: string },
  ) {
    return await this.gameRoomEventService.checkPassword(roomId, body.pin);
  }

  @ApiCreatedResponse({
    schema: { example: '게임 방 초대 완료' },
    description:
      '게임 방 초대 성공 / 상대방 유저에겐 소켓으로 알림 전송 user:invite',
  })
  @ApiBadRequestResponse({
    schema: {
      example: new ResponseDto(
        false,
        HttpStatus.BAD_REQUEST,
        '초대를 요청한 유저가 아닙니다',
      ),
    },
    description: 'Param requestId 잘못 요청',
  })
  @ApiForbiddenResponse({
    schema: {
      example: new ResponseDto(
        false,
        HttpStatus.FORBIDDEN,
        '상대방이 온라인이 아닙니다',
      ),
    },
  })
  @ApiParam({
    name: 'memberId',
    description: '초대한 유저',
  })
  @ApiParam({
    name: 'userId',
    description: '초대 받는 유저',
  })
  @ApiParam({
    name: 'roomId',
    description: '게임 방 번호',
  })
  @ApiOperation({ summary: '게임 방 초대' })
  @Post('/:roomId/providers/:memberId/users/:userId/invite')
  async invite(
    @UserDecorator() user: UserProfile,
    @Param('roomId') roomId: number,
    @Param('memberId') memberId: number,
    @Param('userId') userId: number,
  ) {
    return await this.gameRoomService.invite(
      roomId,
      user.profile,
      memberId,
      userId,
    );
  }

  @ApiCreatedResponse({
    schema: { example: { roomId: 1, joinable: true } },
    description: '게임 방 초대 수락',
  })
  @ApiParam({
    name: 'uuid',
    description: '초대 알림 ID',
  })
  @ApiParam({
    name: 'memberId',
    description: '초대한 유저',
  })
  @ApiParam({
    name: 'userId',
    description: '초대 받는 유저',
  })
  @ApiParam({
    name: 'roomId',
    description: '게임 방 번호',
  })
  @ApiBadRequestResponse({
    schema: {
      example: new ResponseDto(
        false,
        HttpStatus.BAD_REQUEST,
        '초대받은 유저가 아닙니다',
      ),
    },
    description: 'Param userId 잘못 요청',
  })
  @ApiForbiddenResponse({
    schema: {
      example: new ResponseDto(
        false,
        HttpStatus.FORBIDDEN,
        '방의 인원이 초과되었습니다',
      ),
    },
  })
  @ApiOperation({ summary: '게임 방 초대 수락' })
  @Post('/:roomId/providers/:memberId/users/:userId/accept/:uuid')
  async accept(
    @UserDecorator() user: UserProfile,
    @Param('roomId') roomId: number,
    @Param('userId') userId: number,
    @Param('uuid') uuid: string,
  ) {
    return await this.gameRoomService.accept(
      roomId,
      user.profile,
      userId,
      uuid,
    );
  }

  @ApiCreatedResponse({
    description: '게임 방 정보 업데이트 성공 후 Socket Event Update Emit',
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
  @ApiOperation({ summary: '게임 방 정보 업데이트' })
  @UseGuards(ValidateLimitGuard)
  @Patch(':roomId')
  async update(
    @Body() updateGameDto: UpdateGameRoomDto,
    @UserDecorator() user: UserProfile,
    @Param('roomId') roomId: string,
  ): Promise<void> {
    return await this.gameRoomEventService.update(
      +roomId,
      updateGameDto,
      user.id,
    );
  }
  @ApiOkResponse({
    description: '게임 방 나가기 성공',
    schema: {
      example: new ResponseDto(true, HttpStatus.OK, {
        roomId: 1,
        exit: true,
      }),
    },
  })
  @ApiParam({
    name: 'roomId',
    description: '게임 방 번호',
    example: 1,
  })
  @ApiOperation({
    summary: '게임 방 나가기 (나가는 사람이 마지막 사람이면 자동 방 파괴',
  })
  @UseGuards(ExistGameRoomGuard, GameMemberGuard)
  @Delete(':roomId/users/me')
  async leaveGameRoom(
    @Param('roomId') roomId: string,
    @UserDecorator() user: UserProfile,
  ): Promise<object> {
    return await this.gameRoomEventService.leave(+roomId, user.id);
  }

  @ApiOkResponse({
    description: '게임 방 삭제 성공',
    schema: {
      example: new ResponseDto(true, HttpStatus.OK, {
        roomId: 1,
        delete: true,
      }),
    },
  })
  @ApiParam({
    name: 'roomId',
    description: '게임 방 번호',
    example: 1,
  })
  @ApiOperation({ summary: '게임 방 삭제 (게임 끝났을 경우 이 경로)' })
  @UseGuards(ExistGameRoomGuard, GameMemberGuard)
  @Delete(':roomId')
  async removeGame(@Param('roomId') roomId: string): Promise<object> {
    return await this.gameRoomEventService.remove(+roomId);
  }

  @ApiOperation({ summary: 'janus 요청 신경 x 전체 janus 방 삭제' })
  @Delete('janus/rooms')
  async removeJanusRooms() {
    return await this.gameRoomEventService.removeJanusRooms();
  }

  @ApiOperation({ summary: 'janus 요청 신경 x janus 방 하나 삭제' })
  @Delete('janus/:roomId')
  async removeJanusRoom(@Param('roomId') roomId: string) {
    return await this.gameRoomEventService.removeJanusRoom(+roomId);
  }
}
