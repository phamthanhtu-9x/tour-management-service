import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TourController } from './tour.controller';
import { TourService } from './tour.service';
import { TourGateway } from './tour.gateway';

@Module({
  controllers: [TourController],
  providers: [TourService, TourGateway, JwtService],
})
export class TourModule {}
