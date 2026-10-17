import { Global, Module } from '@nestjs/common';
import { PlanService } from './plan.service';

/** Global: các module khác inject PlanService mà không cần import. */
@Global()
@Module({
  providers: [PlanService],
  exports: [PlanService],
})
export class PlanModule {}
