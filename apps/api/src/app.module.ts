import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validate } from './config/env.validation.js';

// Extension slots — each backend phase appends its module import here,
// so parallel phases never restructure this file, only add a line.
// import { AuthModule } from './auth/auth.module.js';
// import { UsersModule } from './users/users.module.js';
// import { GoalsModule } from './goals/goals.module.js';
// import { SavingsEntriesModule } from './savings-entries/savings-entries.module.js';
// import { ExchangeRateModule } from './exchange-rate/exchange-rate.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    // AuthModule,
    // UsersModule,
    // GoalsModule,
    // SavingsEntriesModule,
    // ExchangeRateModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
