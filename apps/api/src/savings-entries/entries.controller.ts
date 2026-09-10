import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { UpdateEntryDto } from './dto/update-entry.dto.js';
import { SavingsEntriesService } from './savings-entries.service.js';

@Controller('entries')
export class EntriesController {
  constructor(private readonly savingsEntriesService: SavingsEntriesService) {}

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
