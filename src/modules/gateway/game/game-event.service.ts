import { Injectable, Logger, Inject } from '@nestjs/common';
import { RedisService } from 'src/modules/redis/redis.service';
import { GameRepository } from 'src/modules/game/game.repository';
import 'dayjs/locale/ko';
import dayjs from 'dayjs';
import { Player } from 'src/modules/game-room/dto/player';
import { WsException } from '@nestjs/websockets';
import { GameTurn } from 'src/modules/gateway/game/constants/game-turn';
import { EnumGameRole, EnumGameTeam } from 'src/common/constants';
import { BallotBox } from 'src/modules/gateway/game/BallotBox';
import { RedisHashesField } from 'src/modules/gateway/common/RedisHashesField';
import { RedisHashesKey } from 'src/modules/gateway/common/RedisHashesKey';
import { GameMessage } from 'src/modules/gateway/game/constants/GameMessage';
import { IsNotPlayerException } from 'src/modules/gateway/game/exception/IsNotPlayerException';
dayjs.locale('ko');

type Nullable<T> = T | null;
// 직업 부여 분리
@Injectable()
export class GameEventService {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    private readonly redisService: RedisService,
    private readonly gameRepository: GameRepository,
  ) {}
  async getGameInfo(roomId: number) {
    return await this.redisService.hget(
      RedisHashesKey.game(roomId),
      RedisHashesField.roomInfo(),
    );
  }
  async leave(roomId: number, playerId: number) {
    const players = await this.findPlayers(roomId);
    const player = players.find((player) => player.id === playerId);
    this.logger.log(
      `playerId: ${playerId} gameEventService player: ${JSON.stringify(
        player,
      )}`,
    );
    player.die = true;
    await this.setPlayers(roomId, players);
    await this.setEscapePlayer(roomId, playerId);
    await this.gameRepository.leave(player);
  }
  async setEscapePlayer(roomId: number, playerId: number) {
    const escapePlayers = await this.getEscapePlayer(roomId);
    escapePlayers.push(playerId);
    await this.redisService.hset(
      RedisHashesKey.game(roomId),
      RedisHashesField.escapePlayer(),
      escapePlayers,
    );
  }
  async getEscapePlayer(roomId: number): Promise<number[]> {
    return (
      (await this.redisService.hget(
        RedisHashesKey.game(roomId),
        RedisHashesField.escapePlayer(),
      )) || []
    );
  }
  async getSkillResult(
    roomId: number,
    day: number,
  ): Promise<{
    die: boolean;
    playerVideoNum: Nullable<number>;
    message: string;
  }> {
    this.logger.log('get skill result');
    const doctorSkill: number = await this.getDoctorSkill(roomId, day);
    const mafiaSkill: number = await this.getMafiaSkill(roomId, day);
    this.logger.log(
      `get skill result doctor: ${doctorSkill} mafia: ${mafiaSkill}`,
    );
    if (!mafiaSkill) {
      return {
        die: false,
        playerVideoNum: null,
        message: GameMessage.NIGHT_NOT_SKILL(),
      };
    }
    const players = await this.findPlayers(roomId);
    if (mafiaSkill === doctorSkill) {
      return {
        die: false,
        playerVideoNum: doctorSkill,
        message: GameMessage.NIGHT_DOCTOR_SKILL(
          players[doctorSkill - 1].nickname,
        ),
      };
    }
    return {
      die: true,
      playerVideoNum: mafiaSkill,
      message: GameMessage.NIGHT_MAFIA_SKILL(players[mafiaSkill - 1].nickname),
    };
  }
  async getDoctorSkill(roomId: number, day: number): Promise<number> {
    return +(await this.redisService.hget(
      RedisHashesKey.game(roomId),
      RedisHashesField.doctorSkill(day),
    ));
  }
  async getMafiaSkill(roomId: number, day: number): Promise<number> {
    return (
      +(await this.redisService.hget(
        RedisHashesKey.game(roomId),
        RedisHashesField.mafiaSKill(day),
      )) || null
    );
  }
  async setDoctorSkill(
    roomId: number,
    day: number,
    playerVideoNum: number,
  ): Promise<void> {
    await this.redisService.hset(
      RedisHashesKey.game(roomId),
      RedisHashesField.doctorSkill(day),
      playerVideoNum,
    );
  }
  async setMafiaKill(
    roomId: number,
    day: number,
    playerVideoNum: number,
  ): Promise<void> {
    await this.redisService.hset(
      RedisHashesKey.game(roomId),
      RedisHashesField.mafiaSKill(day),
      playerVideoNum,
    );
  }
  getLivingPlayerCount(players: Player[]): number {
    let count = 0;
    players.forEach((player) => {
      if (!player.die) count++;
    });
    return count;
  }
  async haveNecessaryConditionOfWinning(
    players: Player[],
    roomId: number,
  ): Promise<{
    win: EnumGameTeam | null;
    message: string | null;
  }> {
    /**
     * 시민팀 마피아팀 둘 중 누가 다 죽었나 체크
     */
    const { citizen, mafia } = players.reduce(
      (acc, cur) => {
        if (cur.die) return acc;
        if (cur.team === EnumGameTeam.CITIZEN) {
          acc.citizen++;
        } else if (cur.team === EnumGameTeam.MAFIA) {
          acc.mafia++;
        }
        return acc;
      },
      { citizen: 0, mafia: 0 },
    );
    this.logger.log(`citize: ${citizen} mafia: ${mafia}`);
    const escapePlayers = await this.getEscapePlayer(roomId);
    this.logger.log(`escape players: ${JSON.stringify(escapePlayers)}`);
    const notEscapePlayers = players.filter(
      (player) => !escapePlayers.includes(player.id),
    );
    this.logger.log(`not escape players: ${JSON.stringify(notEscapePlayers)}`);
    if (!mafia) {
      await this.gameRepository.saveGameScore(
        notEscapePlayers,
        EnumGameTeam.CITIZEN,
      );
      return { win: EnumGameTeam.CITIZEN, message: GameMessage.CITIZEN_WIN() };
    }
    if (mafia >= citizen) {
      await this.gameRepository.saveGameScore(
        notEscapePlayers,
        EnumGameTeam.MAFIA,
      );
      return { win: EnumGameTeam.MAFIA, message: GameMessage.MAFIA_WIN() };
    }
    return { win: null, message: null };
  }
  async deleteGame(roomId: number) {
    await this.redisService.del(RedisHashesKey.game(roomId));
  }
  async getDay(roomId: number): Promise<number> {
    return await this.redisService.hget(
      RedisHashesKey.game(roomId),
      RedisHashesField.day(),
    );
  }
  async setDay(roomId: number): Promise<number> {
    return await this.redisService.hincrby(
      RedisHashesKey.game(roomId),
      RedisHashesField.day(),
    );
  }
  async setPunishVote(roomId: number, day: number): Promise<number> {
    return await this.redisService.hincrby(
      RedisHashesKey.game(roomId),
      RedisHashesField.punish(day),
    );
  }
  async getPunishVote(roomId: number, day: number): Promise<number> {
    return await this.redisService.hget(
      RedisHashesKey.game(roomId),
      RedisHashesField.punish(day),
    );
  }
  async setVote(
    roomId: number,
    day: number,
    playerVideoNum: number,
  ): Promise<void> {
    await this.redisService.hincrby(
      RedisHashesKey.game(roomId),
      RedisHashesField.vote(day, playerVideoNum),
    );
  }
  async getPunishedPlayer(roomId: number, day: number): Promise<Player> {
    return await this.redisService.hget(
      RedisHashesKey.game(roomId),
      RedisHashesField.punishPlayer(day),
    );
  }
  async setPunishedPlayer(
    roomId: number,
    day: number,
    votedPlayer: Player,
  ): Promise<void> {
    await this.redisService.hset(
      RedisHashesKey.game(roomId),
      RedisHashesField.punishPlayer(day),
      votedPlayer,
    );
  }
  async getBallotBox(
    roomId: number,
    day: number,
    numberOfPlayer: number,
  ): Promise<BallotBox> {
    const result: { [key: string]: number } = {};
    for (let i = 1; i <= numberOfPlayer; i++) {
      const count = await this.redisService.hget(
        RedisHashesKey.game(roomId),
        RedisHashesField.vote(day, i),
      );
      result[i] = count;
    }
    return BallotBox.from(result);
  }
  async getGameTurn(roomId: number): Promise<GameTurn> {
    return await this.redisService.hget(
      RedisHashesKey.game(roomId),
      RedisHashesField.turn(),
    );
  }
  async setStatus(roomId: number, status: GameTurn): Promise<void> {
    await this.redisService.hset(
      RedisHashesKey.game(roomId),
      RedisHashesField.turn(),
      status,
    );
  }
  async findPlayers(roomId: number): Promise<Player[]> {
    const maybePlayers: Player[] = await this.redisService.hget(
      RedisHashesKey.game(roomId),
      RedisHashesField.player(),
    );
    if (!maybePlayers || !maybePlayers.length) {
      throw new IsNotPlayerException();
    }
    return maybePlayers;
  }

  async setPlayers(roomId: number, players: Player[]): Promise<void> {
    await this.redisService.hset(
      RedisHashesKey.game(roomId),
      RedisHashesField.player(),
      players,
    );
  }

  private lessThanThreePlayer(
    jobs: EnumGameRole[],
    playerCount: number,
  ): EnumGameRole[] {
    jobs.push(EnumGameRole.CITIZEN);
    if (playerCount === 2) {
      jobs.push(EnumGameRole.MAFIA);
    }
    return jobs;
  }
  setInitialPlayerJob(playerCount: number): EnumGameRole[] {
    if (playerCount < 3) {
      return this.shuffle(this.lessThanThreePlayer([], playerCount));
    }
    return this.shuffle(this.initalJobData([], playerCount));
  }
  private initalJobData(
    jobs: EnumGameRole[],
    playerCount: number,
  ): EnumGameRole[] {
    let mafiaCount: number = playerCount > 6 ? 2 : 1;
    let citizenCount: number = playerCount - (mafiaCount + 2);

    while (mafiaCount--) {
      jobs.push(EnumGameRole.MAFIA);
    }
    while (citizenCount--) {
      jobs.push(EnumGameRole.CITIZEN);
    }
    jobs.push(EnumGameRole.DOCTOR);
    jobs.push(EnumGameRole.POLICE);
    return jobs;
  }

  private shuffle(jobs: EnumGameRole[]): EnumGameRole[] {
    for (let i = jobs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [jobs[i], jobs[j]] = [jobs[j], jobs[i]];
    }
    return jobs;
  }
}
