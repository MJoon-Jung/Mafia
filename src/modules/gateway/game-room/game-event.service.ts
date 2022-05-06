import { Injectable, Logger, Inject } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import dayjs from 'dayjs';
import { map, sortedLastIndexBy } from 'lodash';
import { GameRoom } from 'src/modules/game-room/dto';
import { Player } from 'src/modules/game-room/dto/player';
import { RedisService } from 'src/modules/redis/redis.service';
import { UserProfile } from '../../user/dto/user-profile.dto';
import {
  DOCTOR_FIELD,
  FINISH_VOTE_FIELD,
  GAME,
  INFO_FIELD,
  MAFIA_FIELD,
  PLAYERJOB_FIELD,
  PLAYERNUM_FIELD,
  PLAYER_FIELD,
  PUNISH_FIELD,
  VOTE_FIELD,
} from './constants';

// 직업 부여 분리
@Injectable()
export class GameEventService {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    private readonly redisService: RedisService,
  ) {}

  async findGame(roomId: number): Promise<GameRoom> {
    const game = await this.redisService.hget(
      this.makeGameKey(roomId),
      INFO_FIELD,
    );
    if (!game) {
      throw new WsException('존재하지 않는 게임입니다');
    }

    return game;
  }

  // 해당 방의 게임 플레이어 값을 찾아서 제공.
  async findPlayers(roomId: number): Promise<Player[]> {
    const players = await this.redisService.hget(
      this.makeGameKey(roomId),
      PLAYER_FIELD,
    );

    if (!players) {
      throw new WsException('존재하지 않는 게임입니다');
    }

    return players;
  }

  async getPlayerJobs(roomId: number) {
    try {
      const playerJobs = await this.redisService.hget(
        this.makeGameKey(roomId),
        PLAYERJOB_FIELD,
      );
      this.logger.log(2);
      return playerJobs;
    } catch (err) {
      console.log(err);
    }
  }

  async finishVote(roomId: number): Promise<object> {
    let redisVote = {};

    const vote = await this.getVote(roomId);

    // 해당 숫자값 세주기
    vote.forEach((element) => {
      redisVote[element] = (redisVote[element] || 0) + 1;
    });

    this.logger.log(vote);
    this.logger.log(redisVote);

    redisVote = this.sortObject(redisVote, 'userNum', 'vote');

    await this.redisService.hset(
      this.makeGameKey(roomId),
      FINISH_VOTE_FIELD,
      redisVote,
    );

    return redisVote;

    // redisVote = Object.keys(redisVote).sort(function(a,b){return redisVote[a]-redisVote[b]});

    //     let entries = Object.entries(redisVote);
    // // [["you",100],["me",75],["foo",116],["bar",15]]

    //   let sorted = entries.sort((a, b) => a[1] - b[1]);
    // [["bar",15],["me",75],["you",100],["foo",116]]

    // // // 정렬 내림차순으로
    // redisVote = redisVote.sort(function (a, b) {
    //   return b.vote - a.vote;
    // });
  }

  sortObject(obj, userNum: string, voteNum: string) {
    const arr = [];
    for (const prop in obj) {
      if (obj.hasOwnProperty(prop)) {
        arr.push({
          userNum: prop,
          voteNum: obj[prop],
        });
      }
    }
    arr.sort(function (a, b) {
      return b.voteNum - a.voteNum;
    });
    //arr.sort(function(a, b) { a.value.toLowerCase().localeCompare(b.value.toLowerCase()); }); //use this to sort as strings
    return arr; // returns array
  }

  async getVoteDeath(roomId: number) {
    const votehumon = await this.redisService.hget(
      this.makeGameKey(roomId),
      FINISH_VOTE_FIELD,
    );

    this.logger.log(votehumon);
    this.logger.log(`죽이려는 대상의 번호가 맞나..? ${votehumon[0]}`);

    return votehumon[0].userNum;
  }

  async death(roomId: number, userNum: number) {
    const gamePlayer = await this.getPlayerJobs(roomId);
    gamePlayer[userNum].die = !gamePlayer[userNum].die;

    this.redisService.hset(
      this.makeGameKey(roomId),
      PLAYERJOB_FIELD,
      gamePlayer,
    );

    return gamePlayer[userNum];
  }

  async setPlayerJobs(roomId: number, job: number[], Num: number) {
    const jobs = this.grantJob(job, Num);
    const playerJobs = await this.findPlayers(roomId);

    for (let i = 0; i < Num; i++) {
      playerJobs[i].job = jobs[i];
    }
    return await this.redisService.hset(
      this.makeGameKey(roomId),
      PLAYERJOB_FIELD,
      playerJobs,
    );
  }

  getJobData(playerCount: number) {
    const mafia = 1;
    const doctor = 1;
    const police = 1;
    let cr;
    
    if(playerCount < 4){
      cr = 1;
    }else{
      cr = playerCount - (mafia + doctor + police);
    }
    
    const jobData = [cr, mafia, doctor, police];

    this.logger.log("jobData")
    this.logger.log(jobData)
    

    return jobData;
  }

  timer(){
    const now = dayjs();

    //시작 신호
    const startTime = now.format();
    this.logger.log(`start: ${startTime}`);

    //만료 신호
    const endTime = now.add(1, 'm').format();
    this.logger.log(`end: ${endTime}`);

    return { start: startTime, end: endTime }
  }

  grantJob(job: number[], Num: number) {
    const grantJob = ['CITIZEN', 'MAFIA', 'DOCTOR', 'POLICE']; // 직업

    const roomJob = []; //해당 방의 직업
    let typesOfJobs = 0;
    for (let jobs = 0; jobs < Num; jobs++) {
      roomJob.push(grantJob[typesOfJobs]);
      job[jobs]--;

      if (!job[typesOfJobs]) typesOfJobs++;
    }

    return this.shuffle(roomJob);
  }

  shuffle(job: string[]) {
    // 직업 셔플
    const strikeOut = [];
    while (job.length) {
      const lastidx = job.length - 1;
      const roll = Math.floor(Math.random() * job.length);
      const temp = job[lastidx];
      job[lastidx] = job[roll];
      job[roll] = temp;
      strikeOut.push(job.pop());
    }

    return strikeOut;
  }

  makeGameKey(roomId: number): string {
    return `${GAME}:${roomId}`;
  }

  async setPunish(roomId: number, punish: boolean): Promise<any> {
    await this.redisService.hset(
      this.makeGameKey(roomId),
      PUNISH_FIELD,
      punish,
    );
  }

  async getPunish(roomId: number): Promise<number> {
    const punish = await this.redisService.hget(
      this.makeGameKey(roomId),
      PUNISH_FIELD,
    );

    const punisAgreement = punish.filter((item) => {
      item === true;
    }).length;

    return punisAgreement;
  }

  async usePolice(
    roomId: number,
    userNum: number,
    user: UserProfile,
  ): Promise<string> {
    const gamePlayer = await this.getPlayerJobs(roomId);

    let userJob, police;

    for (const player of gamePlayer) {
      if (player.id === user.profile.id) {
        police = player.job;
      }

      userJob = gamePlayer[userNum].job;
    }

    if (police !== 'POLICE') {
      throw new WsException('경찰이 아닙니다.');
    } else {
      return userJob;
    }
  }

  async useMafia(roomId: number, userNum: number, user: UserProfile) {
    const gamePlayer = await this.getPlayerJobs(roomId);

    let mafia;
    // let voteUser;

    for (const player of gamePlayer) {
      if (player.id === user.profile.id) {
        mafia = player.job;
      }

      // voteUser = gamePlayer[userNum];
    }

    if (mafia !== 'MAFIA') {
      throw new WsException('마피아가 아닙니다.');
    }

    this.redisService.hset(this.makeGameKey(roomId), MAFIA_FIELD, userNum);

    return userNum;
  }

  async useDoctor(roomId: number, userNum: number, user: UserProfile) {
    const gamePlayer = await this.getPlayerJobs(roomId);

    let doctor;
    // let voteUser;

    for (const player of gamePlayer) {
      if (player.id === user.profile.id) {
        doctor = player.job;
      }

      // voteUser = gamePlayer[userNum];
    }

    if (doctor !== 'DOCTOR') {
      throw new WsException('의사가 아닙니다.');
    }

    this.redisService.hset(this.makeGameKey(roomId), DOCTOR_FIELD, userNum);

    return userNum;
  }


  //살아있는 각 팀멤버 수
  async livingHuman(roomId: number) {
    const gamePlayer = await this.redisService.hget(
      this.makeGameKey(roomId),
      PLAYERJOB_FIELD,
    );

    const livingMafia = gamePlayer.filter((player) => {
      player.job === 'MAFIA' && player.die === false;
    }).length;

    const livingCitizen = gamePlayer - livingMafia;

    return { mafia: livingMafia, citizen: livingCitizen };
  }

  winner(mafia: number, citizen: number) {
    if (!mafia) {
      return 'CITIZEN';
    } else if (mafia === citizen) {
      return 'MAFIA';
    }
    return null;
  }

  async setVote(roomId: number, vote: number): Promise<any> {
    return await this.redisService.hset(
      this.makeGameKey(roomId),
      VOTE_FIELD,
      vote,
    );
  }

  async getVote(roomId: number): Promise<number[]> {
    return await this.redisService.hget(this.makeGameKey(roomId), VOTE_FIELD);
  }

  async setPlayerNum(roomId: number) {
    return await this.redisService.hincrby(
      this.makeGameKey(roomId),
      PLAYERNUM_FIELD,
    );
  }

  // async getPlayerNum(roomId: number) {
  //   return await this.redisService.hget(
  //     this.makeGameKey(roomId),
  //     PLAYERNUM_FIELD,
  //   );
  // }

  async delPlayerNum(roomId: number) {
    return await this.redisService.hdel(
      this.makeGameKey(roomId),
      PLAYERNUM_FIELD,
    );
  }

  // async delValue(roomId:number, value){
  //   let filed;
  //   switch(value){
  //     case 'mafia' :
  //       filed = MAFIA_FIELD;
  //       break;
  //     case 'doctor' :
  //       filed = DOCTOR_FIELD;
  //       break;
  //     case 'vote':
  //       filed = FINSH_VOTE_FIELD;
  //       break;
  //     case 'punish':
  //     filed = FINISH_PUNISH_FIELD;
  //     break;
  //   }
  // }
}
