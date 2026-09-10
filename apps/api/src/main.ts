import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DecimalSerializerInterceptor } from './common/decimal.serializer.interceptor.js';
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
  app.useGlobalInterceptors(new DecimalSerializerInterceptor());
  app.useGlobalFilters(new PrismaClientExceptionFilter());
  app.enableShutdownHooks();

  const corsOrigins = process.env.CORS_ORIGINS;
  if (corsOrigins) {
    app.enableCors({ origin: corsOrigins.split(',') });
  }

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
