import { Module } from '@nestjs/common';
import { ExchangeRateController } from './exchange-rate.controller.js';
import { ExchangeRateService } from './exchange-rate.service.js';
import { RateAlertEvaluatorService } from './rate-alert-evaluator.service.js';
import { RateAlertsController } from './rate-alerts.controller.js';
import { RateAlertsService } from './rate-alerts.service.js';
import { RateConverterService } from './rate-converter.service.js';
import { RateProviderClient } from './rate-provider.client.js';
import { RateSnapshotScheduler } from './rate-snapshot.scheduler.js';

@Module({
  controllers: [ExchangeRateController, RateAlertsController],
  providers: [
    ExchangeRateService,
    RateProviderClient,
    RateConverterService,
    RateAlertEvaluatorService,
    RateAlertsService,
    RateSnapshotScheduler,
  ],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
