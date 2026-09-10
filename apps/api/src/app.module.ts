import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { validate } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';

// Extension slots — each backend phase appends its module import here,
// so parallel phases never restructure this file, only add a line.
// import { GoalsModule } from './goals/goals.module.js';
// import { SavingsEntriesModule } from './savings-entries/savings-entries.module.js';
// import { ExchangeRateModule } from './exchange-rate/exchange-rate.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      // e2e suites run against `okane_test` (see .env.test) so they never
      // touch the dev database; NODE_ENV=test is set by the test:e2e script.
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    // GoalsModule,
    // SavingsEntriesModule,
    // ExchangeRateModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global guard: every route requires a valid access token unless marked
    // @Public(). This fails closed — a controller added later with no
    // decorator is protected the moment it exists (see Phase 3 notes).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
