import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { PrismaClientExceptionFilter } from './common/prisma-error.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // DecimalSerializerInterceptor is registered as an APP_INTERCEPTOR in
  // AppModule (not here) so it also applies to e2e tests, which build their
  // own NestApplication directly from AppModule and never call bootstrap().
  app.useGlobalFilters(new PrismaClientExceptionFilter());
  app.enableShutdownHooks();

  const corsOrigins = process.env.CORS_ORIGINS;
  if (corsOrigins) {
    app.enableCors({ origin: corsOrigins.split(',') });
  }

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
