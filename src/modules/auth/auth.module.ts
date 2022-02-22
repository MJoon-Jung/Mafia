import { Logger, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRepository } from '../user/user.repository';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleOauthStrategy } from './google-oauth.strategy';
import { KakaoOauthStrategy } from './kakao-oauth.strategy';
import { NaverOauthStrategy } from './naver-oauth.strategy';
import { SessionSerializer } from './session.serializer';

@Module({
  imports: [
    PassportModule.register({ session: true }),
    TypeOrmModule.forFeature([UserRepository]),
  ],
  controllers: [AuthController],
  providers: [
    SessionSerializer,
    AuthService,
    GoogleOauthStrategy,
    NaverOauthStrategy,
    KakaoOauthStrategy,
    Logger,
  ],
})
export class AuthModule {}
