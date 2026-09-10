import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Public } from './auth/decorators/public.decorator.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Root health-check style route — explicitly public since the global
  // JwtAuthGuard (Phase 3) protects everything by default.
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
