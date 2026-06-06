import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { TourModule } from './tour/tour.module';
import { PrismaModule } from './prisma/prisma.module';
import { UploadModule } from './upload/upload.module';
import { SetupModule } from './setup/setup.module';
import { PlayerModule } from './player/player.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    UserModule,
    TourModule,
    PrismaModule,
    UploadModule,
    SetupModule,
    PlayerModule,
  ],
})
export class AppModule {}
