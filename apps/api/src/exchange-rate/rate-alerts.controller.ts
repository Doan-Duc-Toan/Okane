import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { CreateAlertDto } from './dto/create-alert.dto.js';
import { UpdateAlertDto } from './dto/update-alert.dto.js';
import { RateAlertsService } from './rate-alerts.service.js';

@Controller('rate-alerts')
export class RateAlertsController {
  constructor(private readonly rateAlertsService: RateAlertsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAlertDto) {
    return this.rateAlertsService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.rateAlertsService.findAllForUser(user.userId);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateAlertDto) {
    return this.rateAlertsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.rateAlertsService.remove(user.userId, id);
  }
}
