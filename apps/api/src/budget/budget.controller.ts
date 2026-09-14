import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { BudgetService } from './budget.service.js';
import { UpdateBudgetDto } from './dto/update-budget.dto.js';

// No route takes an id — the user is the key. Every handler resolves its own
// settings row via @CurrentUser(), so there is nothing to tamper with.
@Controller('budget')
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  @Get()
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.budgetService.getSettings(user.userId);
  }

  @Put()
  updateSettings(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateBudgetDto) {
    return this.budgetService.upsertSettings(user.userId, dto);
  }

  @Get('available')
  getAvailable(@CurrentUser() user: AuthenticatedUser) {
    return this.budgetService.getAvailable(user.userId);
  }
}
