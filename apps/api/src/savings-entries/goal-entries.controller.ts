import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { CreateEntryDto } from './dto/create-entry.dto.js';
import { SavingsEntriesService } from './savings-entries.service.js';

const MAX_PAGE_SIZE = 50;

@Controller('goals/:goalId/entries')
export class GoalEntriesController {
  constructor(private readonly savingsEntriesService: SavingsEntriesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('goalId') goalId: string,
    @Body() dto: CreateEntryDto,
  ) {
    return this.savingsEntriesService.create(user.userId, goalId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('goalId') goalId: string,
    @Query('limit', new DefaultValuePipe(MAX_PAGE_SIZE), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.savingsEntriesService.listForGoal(user.userId, goalId, limit, cursor);
  }
}
