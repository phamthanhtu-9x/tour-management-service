import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [
    // Rate limit cho API công khai: 30 request / 60 giây / IP
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 30 }],
      errorMessage: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút',
    }),
  ],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
