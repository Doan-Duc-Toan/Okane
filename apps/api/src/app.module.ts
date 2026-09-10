import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { DecimalSerializerInterceptor } from './common/decimal.serializer.interceptor.js';
import { validate } from './config/env.validation.js';
import { ExchangeRateModule } from './exchange-rate/exchange-rate.module.js';
import { GoalsModule } from './goals/goals.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SavingsEntriesModule } from './savings-entries/savings-entries.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      // e2e suites run against `okane_test` (see .env.test) so they never
      // touch the dev database; NODE_ENV=test is set by the test:e2e script.
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    GoalsModule,
    SavingsEntriesModule,
    ExchangeRateModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global guard: every route requires a valid access token unless marked
    // @Public(). This fails closed — a controller added later with no
    // decorator is protected the moment it exists (see Phase 3 notes).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Registered here (not via app.useGlobalInterceptors() in main.ts) so it
    // applies to every NestApplication built from AppModule, including the
    // ones e2e specs construct directly via Test.createTestingModule(...) —
    // main.ts-only registration left money fields unserialized (raw Decimal
    // .toString(), no fixed scale) in every e2e test, since those never call
    // bootstrap(). Found via a real e2e assertion failure while verifying
    // Phase 5 (rate-alerts threshold came back "175", not "175.00000000").
    { provide: APP_INTERCEPTOR, useClass: DecimalSerializerInterceptor },
  ],
})
export class AppModule {}
