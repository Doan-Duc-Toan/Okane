import { Module } from '@nestjs/common';
import { RateProviderModule } from '../common/rate-provider.module.js';
import { EntriesController } from './entries.controller.js';
import { GoalEntriesController } from './goal-entries.controller.js';
import { SavingsEntriesService } from './savings-entries.service.js';

@Module({
  imports: [RateProviderModule],
  controllers: [GoalEntriesController, EntriesController],
  providers: [SavingsEntriesService],
})
export class SavingsEntriesModule {}
