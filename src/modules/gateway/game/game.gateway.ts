/* eslint-disable @typescript-eslint/ban-types */
import { Inject, Logger, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { WsAuthenticatedGuard } from '../guards/ws.authenticated.guard';
import { GameEvent } from './constants/game-event';
import { AuthenticatedSocket } from '../game-room/constants/authenticated-socket';
import { GameEventService } from './game-event.service';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import 'dayjs/locale/ko';
import dayjs from 'dayjs';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/modules/redis/redis.service';
import { GameRepository } from 'src/modules/game/game.repository';
import { GameTurn } from 'src/modules/gateway/game/constants/game-turn';
import { EnumGameRole, EnumGameTeam } from 'src/common/constants';
import { Player } from 'src/modules/game-room/dto/player';
import { RedisHashesKey } from 'src/modules/gateway/common/RedisHashesKey';
import { RedisHashesField } from 'src/modules/gateway/common/RedisHashesField';
import { PunishBallotBox } from 'src/modules/gateway/game/PunishBallotBox';
import { GameMessage } from 'src/modules/gateway/game/constants/GameMessage';

dayjs.locale('ko');
dayjs.extend(customParseFormat);

@UseGuards(WsAuthenticatedGuard)
@WebSocketGateway({
  transports: ['websocket'],
  cors: { origin: '*', credentials: true },
  namespace: '/game',
})
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    private readonly gameEventService: GameEventService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly gameRepository: GameRepository,
  ) {}
  @WebSocketServer() public server: Server;

  @SubscribeMessage(GameEvent.JOIN)
  async handleGameJoin(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { roomId: number },
  ) {
    const { roomId } = data;
    const players = await this.gameEventService.findPlayers(roomId);
    const maybePlayer = players.find(
      (player) => player.id === socket.request.user.profile.id,
    );
    if (!maybePlayer) {
      throw new WsException('게임 플레이어가 아닙니다');
    }
    await socket.join(`${socket.nsp.name}-${roomId}`);
    socket.data['roomId'] = roomId;

    const count = await this.redisService.hincrby(
      RedisHashesKey.game(roomId),
      RedisHashesField.joinCount(),
    );
    if (count < players.length) return;

    await this.gameEventService.setDay(roomId);
    await this.gameEventService.setStatus(roomId, GameTurn.MEETING);
    const jobs = this.gameEventService.setInitialPlayerJob(count);
    players.forEach((player, idx) => {
      player.job = jobs[idx];
      player.die = false;
      player.team =
        player.job === EnumGameRole.MAFIA
          ? EnumGameTeam.MAFIA
          : EnumGameTeam.CITIZEN;
    });
    await this.gameEventService.setPlayers(roomId, players);
    await this.gameRepository.setRole(players);
    // 굳이 보낼 필요 있나?
    this.server.to(`${socket.nsp.name}-${roomId}`).emit(GameEvent.JOIN);
  }
  @SubscribeMessage(GameEvent.START)
  async handleGameStart(@ConnectedSocket() socket: AuthenticatedSocket) {
    /**
     * status 회의 설정
     * player 직업 설정
     * timer 실행
     */
    const { roomId } = socket.data;
    const players: Player[] = await this.gameEventService.findPlayers(roomId);
    const maybePlayer = players.find(
      (player) => player.id === socket.request.user.profile.id,
    );
    if (!maybePlayer) {
      throw new WsException('게임 플레이어가 아닙니다');
    }
    const count = await this.redisService.hincrby(
      RedisHashesKey.game(roomId),
      RedisHashesField.joinCount(),
    );

    players.forEach((player) => {
      /**
       * mafia인 경우에 mafia 빼고 다 직업 정보 null
       * 다른 직업은 자신 제외 직업 정보 null
       */
      if (maybePlayer.job === EnumGameRole.MAFIA) {
        if (player.job !== EnumGameRole.MAFIA) player.job = null;
      } else {
        if (player.id !== maybePlayer.id) player.job = null;
      }
      return player;
    });

    socket
      .to(`${socket.nsp.name}-${roomId}`)
      .emit(GameEvent.START, { players });

    if (count < players.length) return;

    // Todo timer 실행
    this.startTimer(roomId, `${socket.nsp.name}-${roomId}`);
  }
  async startTimer(roomId: number, socketRoom: string) {
    /**
     * status 확인
     * status에 따라 실행
     * timer 종료 후
     * status 변경
     * startTimer 호출
     *
     */
    const turn: GameTurn = await this.gameEventService.getGameTurn(roomId);
    const day: number = await this.gameEventService.getDay(roomId);
    let time = 60;
    if (turn === GameTurn.MEETING) {
      /**
       * 할 거 없음
       */
      setTimeout(
        async function run(
          gameEventService: GameEventService,
          server: Server,
          startTimer: Function,
        ) {
          if (time-- >= 0) {
            server
              .to(socketRoom)
              .emit(GameEvent.TIMER, { time, status: turn, day });
            setTimeout(run, 1000, gameEventService, server, startTimer);
            return;
          }
          /**
           * turn 변경 및 startTimer 실행
           */
          await gameEventService.setStatus(roomId, GameTurn.VOTE);
          await startTimer();
        },
        1000,
        this.gameEventService,
        this.server,
        this.startTimer,
      );
    } else if (turn === GameTurn.VOTE) {
      /**
       * 할 거 없음
       */
      setTimeout(
        async function run(
          gameEventService: GameEventService,
          server: Server,
          startTimer: Function,
        ) {
          if (time-- >= 0) {
            server
              .to(socketRoom)
              .emit(GameEvent.TIMER, { time, status: turn, day });
            setTimeout(run, 1000, gameEventService, server, startTimer);
            return;
          }
          /**
           * vote 결과 종합 후 다음 턴 계산해서 바꿔줌
           */
          const ballotBox = await gameEventService.getBallotBox(roomId, day);

          const players = await gameEventService.findPlayers(roomId);
          if (
            ballotBox.majorityVote(
              gameEventService.getLivingPlayerCount(players),
            )
          ) {
            const votedPlayer: Player =
              players[ballotBox.electedPlayerVideoNum() - 1];
            if (votedPlayer.die)
              throw new WsException('이미 죽은 플레이어입니다.');

            await gameEventService.setPunishedPlayer(roomId, day, votedPlayer);
            await gameEventService.setStatus(roomId, GameTurn.PUNISHMENT);

            server.to(socketRoom).emit(GameEvent.VOTE, {
              playerVideoNum: ballotBox.electedPlayerVideoNum(),
              message: GameMessage.VOTE_RESULT_MAJORITY(votedPlayer.nickname),
            });
          } else {
            await gameEventService.setStatus(roomId, GameTurn.NIGHT);
            server.to(socketRoom).emit(GameEvent.VOTE, {
              playerVideoNum: null,
              message: GameMessage.VOTE_RESULT_NOT_MAJORITY(),
            });
          }
          // Todo message 처형되는 사람 누구인지 등등 정보 생각할 것
          await startTimer();
        },
        1000,
        this.gameEventService,
        this.server,
        this.startTimer,
      );
    } else if (turn === GameTurn.PUNISHMENT) {
      /**
       * 할 거 없음
       */
      setTimeout(
        async function run(
          gameEventService: GameEventService,
          server: Server,
          startTimer: Function,
        ) {
          if (time-- >= 0) {
            server
              .to(socketRoom)
              .emit(GameEvent.TIMER, { time, status: turn, day });
            setTimeout(run, 1000, gameEventService, server, startTimer);
            return;
          }
          /**
           * punish 결과 종합 후
           * 처형됐는지 안됐는지 처리할 것
           * 처형됐다면 승리 조건 검사
           * turn night로 변경
           */
          const result = await gameEventService.getPunishVote(roomId, day);
          const punishBallotBox = PunishBallotBox.of(result);
          const players = await gameEventService.findPlayers(roomId);
          let data: {
            result: boolean;
            playerVideoNum: number;
            message: string;
          };
          if (
            punishBallotBox.majorityVote(
              gameEventService.getLivingPlayerCount(players),
            )
          ) {
            const punishedPlayer: Player =
              await gameEventService.getPunishedPlayer(roomId, day);

            // 죽음 처리 저장
            let playerVideoNum: number;
            players.forEach((player, idx) => {
              if (player.id === punishedPlayer.id) {
                player.die = true;
                playerVideoNum = idx + 1;
              }
            });
            gameEventService.setPlayers(roomId, players);
            // socket 데이터 전송
            if (punishedPlayer.job === EnumGameRole.MAFIA) {
              data = {
                result: true,
                playerVideoNum,
                message: GameMessage.PUNISH_RESULT_MAFIA(),
              };
            } else {
              data = {
                result: true,
                playerVideoNum,
                message: GameMessage.PUNISH_RESULT_CITIZEN(),
              };
            }
            server.to(socketRoom).emit(GameEvent.PUNISH, data);
            // 승리 조건 검사 후 게임 END
            const result =
              await gameEventService.haveNecessaryConditionOfWinning(players);
            if (result.win) {
              setTimeout(() => {
                server.to(socketRoom).emit(GameEvent.END, result);
              }, 2000);
              return;
            }
          } else {
            data = {
              result: false,
              playerVideoNum: null,
              message: GameMessage.PUNISH_NOT_MAJORITY(),
            };
          }
          await gameEventService.setStatus(roomId, GameTurn.NIGHT);
          await startTimer();
        },
        1000,
        this.gameEventService,
        this.server,
        this.startTimer,
      );
    } else if (turn === GameTurn.NIGHT) {
      setTimeout(
        async function run(
          gameEventService: GameEventService,
          server: Server,
          startTimer: Function,
        ) {
          if (time-- >= 0) {
            server
              .to(socketRoom)
              .emit(GameEvent.TIMER, { time, status: turn, day });
            setTimeout(run, 1000, gameEventService, server, startTimer);
            return;
          }
          /**
           * 밤 능력 종합 후 게임 승리 조건 검사한 후 타이머 실행한다.
           */
          const result = await gameEventService.getSkillResult(roomId, day);
          server.to(socketRoom).emit(GameEvent.SKILL, result);

          if (result.die) {
            const players = await gameEventService.findPlayers(roomId);
            // 죽음 처리
            players.forEach((player) => {
              if (player.id === result.playerVideoNum) {
                player.die = true;
              }
            });
            gameEventService.setPlayers(roomId, players);
            // 승리 조건 검사
            const data = await gameEventService.haveNecessaryConditionOfWinning(
              players,
            );
            if (data.win) {
              setTimeout(() => {
                server.to(socketRoom).emit(GameEvent.END, data);
              }, 2000);
              //Todo database에 저장
              return;
            }
          }
          await gameEventService.setStatus(roomId, GameTurn.MEETING);
          await startTimer();
        },
        1000,
        this.gameEventService,
        this.server,
        this.startTimer,
      );
    }
  }
  @SubscribeMessage(GameEvent.VOTE)
  async handleGameVote(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { roomId: number; playerVideoNum: number },
  ) {
    const { roomId } = socket.data;
    const players = await this.gameEventService.findPlayers(roomId);
    const maybePlayer = players.find(
      (player) => player.id === socket.request.user.profile.id,
    );
    if (!maybePlayer) {
      throw new WsException('게임 플레이어가 아닙니다');
    }
    const day = await this.gameEventService.getDay(roomId);
    await this.gameEventService.setVote(roomId, day, data.playerVideoNum);
  }
  @SubscribeMessage(GameEvent.PUNISH)
  async handleGamePunish(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { roomId: number; agree: boolean },
  ) {
    const { roomId } = socket.data;
    const players = await this.gameEventService.findPlayers(roomId);
    const maybePlayer = players.find(
      (player) => player.id === socket.request.user.profile.id,
    );
    if (!maybePlayer) {
      throw new WsException('게임 플레이어가 아닙니다');
    }
    const day = await this.gameEventService.getDay(roomId);
    if (data.agree) {
      await this.gameEventService.setPunishVote(roomId, day);
    }
  }
  @SubscribeMessage(GameEvent.MAFIA)
  async handleGameMafiaSkill(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { roomId: number; playerVideoNum: number },
  ) {
    const { roomId } = socket.data;
    const players = await this.gameEventService.findPlayers(roomId);
    const maybePlayer = players.find(
      (player) => player.id === socket.request.user.profile.id,
    );
    if (!maybePlayer) {
      throw new WsException('게임 플레이어가 아닙니다');
    }
    if (maybePlayer.job !== EnumGameRole.MAFIA) {
      throw new WsException('마피아의 능력을 사용할 권한이 없습니다.');
    }
    if (!data.playerVideoNum) return;
    const day = await this.gameEventService.getDay(roomId);
    await this.gameEventService.setMafiaKill(roomId, day, data.playerVideoNum);
  }
  @SubscribeMessage(GameEvent.DOCTOR)
  async handleGameDoctorSkill(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { roomId: number; playerVideoNum: number },
  ) {
    const { roomId } = socket.data;
    const players = await this.gameEventService.findPlayers(roomId);
    const maybePlayer = players.find(
      (player) => player.id === socket.request.user.profile.id,
    );
    if (!maybePlayer) {
      throw new WsException('게임 플레이어가 아닙니다');
    }
    if (maybePlayer.job !== EnumGameRole.DOCTOR) {
      throw new WsException('의사의 능력을 사용할 권한이 없습니다.');
    }
    if (!data.playerVideoNum) return;
    const day = await this.gameEventService.getDay(roomId);
    await this.gameEventService.setDoctorSkill(
      roomId,
      day,
      data.playerVideoNum,
    );
  }
  @SubscribeMessage(GameEvent.POLICE)
  async handleGamePoliceSkill(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { roomId: number; playerVideoNum: number },
  ) {
    const { roomId } = socket.data;
    const players = await this.gameEventService.findPlayers(roomId);
    const maybePlayer = players.find(
      (player) => player.id === socket.request.user.profile.id,
    );
    if (!maybePlayer) {
      throw new WsException('게임 플레이어가 아닙니다');
    }
    if (maybePlayer.job !== EnumGameRole.POLICE) {
      throw new WsException('경찰의 능력을 사용할 권한이 없습니다.');
    }

    if (!data.playerVideoNum) return;

    this.server.to(socket.id).emit(GameEvent.POLICE, {
      message: GameMessage.NIGHT_POLICE_SKILL(
        players[data.playerVideoNum].nickname,
        players[data.playerVideoNum].job,
      ),
    });
  }
  //Todo 탈주 및 죽은 사람을 제외하고 과반수 이상의 투표를 얻어야함
  //Todo 탈주 처리 - rdb, mdb 저장
  @SubscribeMessage(GameEvent.LEAVE)
  async handleLeave(@ConnectedSocket() socket: AuthenticatedSocket) {
    const { roomId } = socket.data;
    socket.data = null;
    await this.leave(
      roomId,
      `${socket.nsp.name}-${roomId}`,
      socket.request.user.profile.id,
    );
  }

  @SubscribeMessage(GameEvent.LANDMARK)
  handleLandmarks(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { landmarks: string | null },
  ) {
    // socket room안에 자신을 제외한 플레이어들에게 landmark 정보 전달
    const { roomId } = socket.data;
    this.server.in(`${socket.nsp.name}-${roomId}`).emit(GameEvent.LANDMARK, {
      id: socket.request.user.profile.id,
      landmarks: data?.landmarks || null,
    });
  }
  @SubscribeMessage(GameEvent.SPEAK)
  async handleSpeak(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody()
    data: { userId: number; nickname: string; speaking: boolean },
  ) {
    const { roomId } = socket.data;
    this.server.to(`${socket.nsp.name}-${roomId}`).emit(GameEvent.SPEAK, data);
  }

  async handleConnection(@ConnectedSocket() socket: AuthenticatedSocket) {}
  async handleDisconnect(@ConnectedSocket() socket: AuthenticatedSocket) {
    const { roomId } = socket.data;
    if (!roomId) return;
    socket.data = null;
    await this.leave(
      roomId,
      `${socket.nsp.name}-${roomId}`,
      socket.request.user.profile.id,
    );
  }
  afterInit(server: any) {}
  async leave(roomId: number, socketRoom: string, playerId: number) {
    await this.gameEventService.leave(roomId, playerId);
    this.server.to(socketRoom).emit(GameEvent.LEAVE, { playerId });
    const players = await this.gameEventService.findPlayers(roomId);
    const result = await this.gameEventService.haveNecessaryConditionOfWinning(
      players,
    );
    if (result.win) {
      setTimeout(() => {
        this.server.to(`${socketRoom}-${roomId}`).emit(GameEvent.END, result);
      }, 1000);
      return;
    }
  }
}
