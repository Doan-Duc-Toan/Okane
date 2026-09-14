import { Module } from '@nestjs/common';
import { RateProviderModule } from '../common/rate-provider.module.js';
import { GoalsModule } from '../goals/goals.module.js';
import { BudgetController } from './budget.controller.js';
import { BudgetMathService } from './budget-math.service.js';
import { BudgetService } from './budget.service.js';

// One-way dependency on GoalsModule (GoalsService is already exported there)
// — never the reverse, or Nest fails to boot on the cycle. See phase-03 Key
// Insights for why GET /budget/available isn't folded into DashboardService.
@Module({
  imports: [GoalsModule, RateProviderModule],
  controllers: [BudgetController],
  providers: [BudgetService, BudgetMathService],
})
export class BudgetModule {}
