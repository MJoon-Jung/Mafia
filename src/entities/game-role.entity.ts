/* eslint-disable prettier/prettier */
import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsEnum, IsInt, IsNotEmpty } from 'class-validator';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GameMember } from './game-member.entity';
import { EnumGameRole } from '../common/constants';

@Entity('game_role')
export class GameRole {
  @ApiProperty({
    example: 1,
    description: '게임 역할 고유 ID',
  })
  @IsInt()
  @IsNotEmpty()
  @PrimaryColumn()
  id: number;

  @ApiProperty({
    example: 'CITIZEN',
    description: '게임 역할 이름',
  })
  @Column({ type: 'varchar', name: 'name', unique: true })
  name: EnumGameRole;

  @IsDate()
  @CreateDateColumn()
  createdAt: Date;

  @IsDate()
  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => GameMember, (members) => members.gameRole)
  members: GameMember[];
}
