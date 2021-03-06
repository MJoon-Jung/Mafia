import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsEnum, IsInt, IsNotEmpty, IsOptional } from 'class-validator';
import { EnumStatus } from '../common/constants/enum-status';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Profile } from './profile.entity';

@Unique('UK_FRIEND_USER_ID_FRIEND_ID', ['userId', 'friendId'])
@Entity('friend')
export class Friend {
  @ApiProperty({
    example: 1,
    description: '친구 고유 ID',
  })
  @IsInt()
  @IsNotEmpty()
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({
    example: 1,
    description: '친구 신청 유저 ID',
  })
  @IsInt()
  @IsNotEmpty()
  @Index('IDX_FRIEND_USER_ID')
  @Column({ type: 'int', name: 'user_id' })
  userId: number;

  @ManyToOne(() => Profile, (user) => user.friend1, {
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
  user: Profile;

  @ApiProperty({
    example: 1,
    description: '받아준 친구 유저 ID',
  })
  @IsInt()
  @IsNotEmpty()
  @Index('IDX_FRIEND_FRIEND_ID')
  @Column({ type: 'int', name: 'friend_id' })
  friendId: number;

  @ManyToOne(() => Profile, (user) => user.friend2, {
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'friend_id', referencedColumnName: 'userId' })
  friend: Profile;

  @IsEnum(EnumStatus)
  @IsOptional()
  @Column({
    type: 'enum',
    enum: EnumStatus,
    default: EnumStatus.REQUEST,
  })
  status: EnumStatus;

  @IsDate()
  @CreateDateColumn()
  createdAt: Date;

  @IsDate()
  @UpdateDateColumn()
  updatedAt: Date;
}
