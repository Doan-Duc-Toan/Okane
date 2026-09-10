import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { ConvertDto } from './dto/convert.dto.js';
import { HistoryQueryDto } from './dto/history-query.dto.js';
import { ExchangeRateService } from './exchange-rate.service.js';
import { RateConverterService } from './rate-converter.service.js';

// Left authenticated behind the default global guard — the rate ticker only
// appears inside the app, so there's no reason to mark these @Public().
@Controller('rates')
export class ExchangeRateController {
  constructor(
    private readonly exchangeRateService: ExchangeRateService,
    private readonly converter: RateConverterService,
  ) {}

  @Get('current')
  async getCurrent() {
    const current = await this.exchangeRateService.getCurrent();
    if (!current) throw new NotFoundException('No exchange rate available yet');
    return current;
  }

  @Get('history')
  getHistory(@Query() query: HistoryQueryDto) {
    return this.exchangeRateService.getHistory(query.range);
  }

  @Post('convert')
  async convert(@Body() dto: ConvertDto) {
    const amount = new Decimal(dto.amount);
    if (!amount.greaterThan(0)) {
      throw new BadRequestException('amount must be greater than 0');
    }

    if (dto.from === dto.to) {
      return { amount: dto.amount, from: dto.from, to: dto.to, converted: amount.toDecimalPlaces(0), rate: null, asOf: null };
    }

    const current = await this.exchangeRateService.getCurrent();
    if (!current) {
      throw new ServiceUnavailableException('No exchange rate available yet — try again shortly');
    }

    const converted = this.converter.convert(amount, dto.from, dto.to, current.rate);
    return { amount: dto.amount, from: dto.from, to: dto.to, converted, rate: current.rate, asOf: current.asOf };
  }
}
