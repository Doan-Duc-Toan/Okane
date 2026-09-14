import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { CreateSplitDto } from './dto/create-split.dto.js';
import { UpdateEntryDto } from './dto/update-entry.dto.js';
import { SavingsEntriesService } from './savings-entries.service.js';

@Controller('entries')
export class EntriesController {
  constructor(private readonly savingsEntriesService: SavingsEntriesService) {}

  // Declared above any `:id`-style route so `split` is never captured as an id.
  @Post('split')
  async createSplit(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSplitDto) {
    const entries = await this.savingsEntriesService.createSplit(user.userId, dto);
    return { entries };
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateEntryDto) {
    return this.savingsEntriesService.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.savingsEntriesService.remove(user.userId, id);
  }
}
