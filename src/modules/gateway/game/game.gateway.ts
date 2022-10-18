/* eslint-disable @typescript-eslint/ban-types */
import { Inject, Logger, UseFilters, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { WsAuthenticatedGuard } from '../guards/ws.authenticated.guard';
import { GameEvent } from './constants/game-event';
import { AuthenticatedSocket } from '../game-room/constants/authenticated-socket';
import { GameEventService } from './game-event.service';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import 'dayjs/locale/ko';
import dayjs from 'dayjs';
import { RedisService } from 'src/modules/redis/redis.service';
import { GameRepository } from 'src/modules/game/game.repository';
import { GameTurn } from 'src/modules/gateway/game/constants/game-turn';
import { EnumGameRole, EnumGameTeam } from 'src/common/constants';
import { Player } from 'src/modules/game-room/dto/player';
import { RedisHashesKey } from 'src/modules/gateway/common/RedisHashesKey';
import { RedisHashesField } from 'src/modules/gateway/common/RedisHashesField';
import { PunishBallotBox } from 'src/modules/gateway/game/PunishBallotBox';
import { GameMessage } from 'src/modules/gateway/game/constants/GameMessage';
import { GameTime } from 'src/modules/gateway/game/constants/GameTime';
import { BallotBox } from 'src/modules/gateway/game/BallotBox';
import {
  ADeadPlayerException,
  ForbiddenDoctorSkillException,
  ForbiddenMafiaSkillException,
  ForbiddenPoliceSkillException,
  IsNotPlayerException,
} from 'src/modules/gateway/game/exception';
import { AllWsExceptionsFilter } from 'src/modules/gateway/game/exception/AllWsExceptionsFilter';

dayjs.locale('ko');
dayjs.extend(customParseFormat);

@UseGuards(WsAuthenticatedGuard)
@UseFilters(new AllWsExceptionsFilter())
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
      throw new IsNotPlayerException();
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
    setTimeout(() => {
      this.server.to(`${socket.nsp.name}-${roomId}`).emit(GameEvent.JOIN);
    }, 3000);
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
      throw new IsNotPlayerException();
    }
    const count = await this.redisService.hincrby(
      RedisHashesKey.game(roomId),
      RedisHashesField.startCount(),
    );

    players.forEach((player) => {
      /**
       * mafia인 경우에 mafia 빼고 다 직업 정보 null
       * 다른 직업은 자신 제외 직업 정보 null
       */
      if (maybePlayer.job === EnumGameRole.MAFIA) {
        if (player.job !== EnumGameRole.MAFIA) {
          player.job = null;
          player.team = null;
        }
      } else {
        if (player.id !== maybePlayer.id) {
          player.job = null;
          player.team = null;
        }
      }
    });

    this.server.in(`${socket.id}`).emit(GameEvent.START, { players });

    if (count < players.length) return;
    setTimeout(async () => {
      await this.startTimer(roomId, `${socket.nsp.name}-${roomId}`);
    }, 3000);
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
    if (turn === GameTurn.MEETING) {
      let timer = GameTime.MEETING_TIME;
      /**
       * 할 거 없음
       */
      setTimeout(
        async function run(that: GameGateway) {
          if (timer-- > 0) {
            that.server
              .to(socketRoom)
              .emit(GameEvent.TIMER, { timer, status: turn, day });
            setTimeout(run, 1000, that);
            return;
          }
          /**
           * turn 변경 및 startTimer 실행
           */
          if (await that.gameIsEnded(roomId)) {
            return;
          }

          await that.gameEventService.setStatus(roomId, GameTurn.VOTE);
          await that.startTimer(roomId, socketRoom);
        },
        1000,
        this,
      );
    } else if (turn === GameTurn.VOTE) {
      /**
       * 할 거 없음
       */
      let timer = GameTime.VOTE_TIME;
      setTimeout(
        async function run(that: GameGateway) {
          if (timer-- > 0) {
            that.server
              .to(socketRoom)
              .emit(GameEvent.TIMER, { timer, status: turn, day });
            setTimeout(run, 1000, that);
            return;
          }
          /**
           * vote 결과 종합 후 다음 턴 계산해서 바꿔줌
           */
          if (await that.gameIsEnded(roomId)) {
            return;
          }

          const players = await that.gameEventService.findPlayers(roomId);
          const ballotBox: BallotBox = await that.gameEventService.getBallotBox(
            roomId,
            day,
            players.length,
          );
          if (ballotBox.tieTheVote()) {
            await that.gameEventService.setStatus(roomId, GameTurn.NIGHT);
            that.server.to(socketRoom).emit(GameEvent.VOTE, {
              playerVideoNum: null,
              message: GameMessage.VOTE_RESULT_TIE(),
            });
          } else if (
            ballotBox.majorityVote(
              that.gameEventService.getLivingPlayerCount(players),
            )
          ) {
            const votedPlayer: Player =
              players[ballotBox.electedPlayerVideoNum() - 1];
            that.logger.log(
              '============votedPlayer============' +
                JSON.stringify(votedPlayer),
            );
            if (votedPlayer.die) throw new ADeadPlayerException();

            await that.gameEventService.setPunishedPlayer(
              roomId,
              day,
              votedPlayer,
            );
            await that.gameEventService.setStatus(roomId, GameTurn.PUNISHMENT);

            that.server.to(socketRoom).emit(GameEvent.VOTE, {
              playerVideoNum: ballotBox.electedPlayerVideoNum(),
              message: GameMessage.VOTE_RESULT_MAJORITY(votedPlayer.nickname),
            });
          } else {
            await that.gameEventService.setStatus(roomId, GameTurn.NIGHT);
            that.server.to(socketRoom).emit(GameEvent.VOTE, {
              playerVideoNum: null,
              message: GameMessage.VOTE_RESULT_NOT_MAJORITY(),
            });
          }
          await that.startTimer(roomId, socketRoom);
        },
        1000,
        this,
      );
    } else if (turn === GameTurn.PUNISHMENT) {
      /**
       * 할 거 없음
       */
      let timer = GameTime.PUNISH_TIME;
      setTimeout(
        async function run(that: GameGateway) {
          if (timer-- > 0) {
            that.server
              .to(socketRoom)
              .emit(GameEvent.TIMER, { timer, status: turn, day });
            setTimeout(run, 1000, that);
            return;
          }
          /**
           * punish 결과 종합 후
           * 처형됐는지 안됐는지 처리할 것
           * 처형됐다면 승리 조건 검사
           * turn night로 변경
           */
          if (await that.gameIsEnded(roomId)) {
            return;
          }
          const result = await that.gameEventService.getPunishVote(roomId, day);
          const punishBallotBox = PunishBallotBox.of(result);
          const players = await that.gameEventService.findPlayers(roomId);
          let data: {
            result: boolean;
            playerVideoNum: number;
            message: string;
          };

          if (
            punishBallotBox.majorityVote(
              that.gameEventService.getLivingPlayerCount(players),
            )
          ) {
            const punishedPlayer: Player =
              await that.gameEventService.getPunishedPlayer(roomId, day);
            that.logger.log(
              '============punishedPlayer============' +
                JSON.stringify(punishedPlayer),
            );

            // 죽음 처리 저장
            let playerVideoNum: number;
            players.forEach((player, idx) => {
              if (player.id === punishedPlayer.id) {
                player.die = true;
                playerVideoNum = idx + 1;
              }
            });
            that.gameEventService.setPlayers(roomId, players);
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
            that.server.to(socketRoom).emit(GameEvent.PUNISH, data);
            // 승리 조건 검사 후 게임 END
            // const result =
            //   await that.gameEventService.haveNecessaryConditionOfWinning(
            //     players,
            //     roomId,
            //   );
            // if (result.win) {
            //   setTimeout(() => {
            //     that.server.to(socketRoom).emit(GameEvent.END, result);
            //   }, 2000);
            //   await that.gameEventService.deleteGame(roomId);
            //   return;
            // }
          } else {
            data = {
              result: false,
              playerVideoNum: null,
              message: GameMessage.PUNISH_NOT_MAJORITY(),
            };
            that.server.to(socketRoom).emit(GameEvent.PUNISH, data);
          }
          await that.gameEventService.setStatus(roomId, GameTurn.NIGHT);
          await that.startTimer(roomId, socketRoom);
        },
        1000,
        this,
      );
    } else if (turn === GameTurn.NIGHT) {
      let timer = GameTime.NIGHT_TIME;
      setTimeout(
        async function run(that: GameGateway) {
          if (timer-- > 0) {
            that.server
              .to(socketRoom)
              .emit(GameEvent.TIMER, { timer, status: turn, day });
            setTimeout(run, 1000, that);
            return;
          }
          /**
           * 밤 능력 종합 후 게임 승리 조건 검사한 후 타이머 실행한다.
           */
          if (await that.gameIsEnded(roomId)) {
            return;
          }
          const result = await that.gameEventService.getSkillResult(
            roomId,
            day,
          );
          that.logger.log(
            `night event skill result: ${JSON.stringify(result)}`,
          );
          that.server.to(socketRoom).emit(GameEvent.SKILL, result);

          if (result.die) {
            const players = await that.gameEventService.findPlayers(roomId);
            // 죽음 처리
            players.forEach((player, idx) => {
              if (idx === result.playerVideoNum - 1) {
                player.die = true;
              }
            });
            that.gameEventService.setPlayers(roomId, players);
            // 승리 조건 검사
            // const data =
            //   await that.gameEventService.haveNecessaryConditionOfWinning(
            //     players,
            //     roomId,
            //   );
            // if (data.win) {
            //   setTimeout(() => {
            //     that.server.to(socketRoom).emit(GameEvent.END, data);
            //   }, 2000);
            //   await that.gameEventService.deleteGame(roomId);
            //   return;
            // }
          }
          await that.gameEventService.setDay(roomId);
          await that.gameEventService.setStatus(roomId, GameTurn.MEETING);
          await that.startTimer(roomId, socketRoom);
        },
        1000,
        this,
      );
    }
  }
  @SubscribeMessage(GameEvent.VOTE)
  async handleGameVote(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { playerVideoNum: number },
  ) {
    const { roomId } = socket.data;
    const players = await this.gameEventService.findPlayers(roomId);
    const maybePlayer = players.find(
      (player) => player.id === socket.request.user.profile.id,
    );
    if (!maybePlayer) {
      throw new IsNotPlayerException();
    }
    const votedPlayer = players.find(
      (_, idx) => idx === data.playerVideoNum - 1,
    );
    if (votedPlayer.die) {
      throw new ADeadPlayerException();
    }
    const day = await this.gameEventService.getDay(roomId);
    await this.gameEventService.setVote(roomId, day, data.playerVideoNum);
  }
  @SubscribeMessage(GameEvent.PUNISH)
  async handleGamePunish(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { agree: boolean },
  ) {
    const { roomId } = socket.data;
    const players = await this.gameEventService.findPlayers(roomId);
    const maybePlayer = players.find(
      (player) => player.id === socket.request.user.profile.id,
    );
    if (!maybePlayer) {
      throw new IsNotPlayerException();
    }
    const day = await this.gameEventService.getDay(roomId);
    if (data.agree) {
      await this.gameEventService.setPunishVote(roomId, day);
    }
  }
  @SubscribeMessage(GameEvent.MAFIA)
  async handleGameMafiaSkill(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { playerVideoNum: number },
  ) {
    const { roomId } = socket.data;
    const players = await this.gameEventService.findPlayers(roomId);
    const maybePlayer = players.find(
      (player) => player.id === socket.request.user.profile.id,
    );
    if (!maybePlayer) {
      throw new IsNotPlayerException();
    }
    if (maybePlayer.job !== EnumGameRole.MAFIA) {
      throw new ForbiddenMafiaSkillException();
    }
    this.logger.log(`mafia event playerVideoNum: ${data.playerVideoNum}`);
    if (!data.playerVideoNum) return;
    if (players[data.playerVideoNum - 1].die) {
      throw new ADeadPlayerException();
    }
    const day = await this.gameEventService.getDay(roomId);
    await this.gameEventService.setMafiaKill(roomId, day, data.playerVideoNum);
  }
  @SubscribeMessage(GameEvent.DOCTOR)
  async handleGameDoctorSkill(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { playerVideoNum: number },
  ) {
    const { roomId } = socket.data;
    const players = await this.gameEventService.findPlayers(roomId);
    const maybePlayer = players.find(
      (player) => player.id === socket.request.user.profile.id,
    );
    if (!maybePlayer) {
      throw new IsNotPlayerException();
    }
    if (maybePlayer.job !== EnumGameRole.DOCTOR) {
      throw new ForbiddenDoctorSkillException();
    }
    this.logger.log(`doctor event playerVideoNum: ${data.playerVideoNum}`);
    if (!data.playerVideoNum) return;
    if (players[data.playerVideoNum - 1].die) {
      throw new ADeadPlayerException();
    }
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
    @MessageBody() data: { playerVideoNum: number },
  ) {
    const { roomId } = socket.data;
    const players = await this.gameEventService.findPlayers(roomId);
    const maybePlayer = players.find(
      (player) => player.id === socket.request.user.profile.id,
    );
    if (!maybePlayer) {
      throw new IsNotPlayerException();
    }
    if (maybePlayer.job !== EnumGameRole.POLICE) {
      throw new ForbiddenPoliceSkillException();
    }
    this.logger.log(`police event playerVideoNum: ${data.playerVideoNum}`);

    if (!data.playerVideoNum) return;
    if (players[data.playerVideoNum - 1].die) {
      throw new ADeadPlayerException();
    }

    this.server.in(socket.id).emit(GameEvent.POLICE, {
      message: GameMessage.NIGHT_POLICE_SKILL(
        players[data.playerVideoNum - 1].nickname,
        players[data.playerVideoNum - 1].job,
      ),
    });
  }
  @SubscribeMessage(GameEvent.LEAVE)
  async handleLeave(@ConnectedSocket() socket: AuthenticatedSocket) {
    const { roomId } = socket.data;
    socket.data = null;
    this.logger.log('leave event 발생');
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

  async handleConnection(@ConnectedSocket() socket: AuthenticatedSocket) {
    this.logger.log(
      `socket connected ${socket.nsp.name} ${socket.id} ${socket.data.roomId}`,
    );
  }
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
    if (await this.gameIsEnded(roomId)) {
      return;
    }
    await this.gameEventService.leave(roomId, playerId);
    this.server.to(socketRoom).emit(GameEvent.LEAVE, { playerId });
    const players = await this.gameEventService.findPlayers(roomId);
    const result = await this.gameEventService.haveNecessaryConditionOfWinning(
      players,
      roomId,
    );
    this.logger.log(`leave result: ${JSON.stringify(result)}`);
    if (result.win) {
      setTimeout(() => {
        this.server.to(socketRoom).emit(GameEvent.END, result);
      }, 1000);
      await this.gameEventService.deleteGame(roomId);
    }
  }
  async gameIsEnded(roomId: number): Promise<boolean> {
    const info = await this.gameEventService.getGameInfo(roomId);
    if (!info) {
      return true;
    }
    return false;
  }
}
