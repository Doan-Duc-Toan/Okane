import { Module } from '@nestjs/common';
import { RateProviderModule } from '../common/rate-provider.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { GoalMathService } from './goal-math.service.js';
import { GoalsController } from './goals.controller.js';
import { GoalsService } from './goals.service.js';

@Module({
  imports: [RateProviderModule],
  controllers: [GoalsController, DashboardController],
  providers: [GoalsService, GoalMathService, DashboardService],
  exports: [GoalsService],
})
export class GoalsModule {}
