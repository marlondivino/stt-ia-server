import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { BossProvider } from './queue/boss.provider';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Ensure uploads directory exists
  const uploadsDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    logger.log(`Created uploads directory: ${uploadsDir}`);
  }

  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors();

  // Global prefix for all routes
  app.setGlobalPrefix('api');

  // pg-boss is initialized via BossProvider.onModuleInit (Nest lifecycle)
  // which runs before the app starts listening
  const bossProvider = app.get(BossProvider);
  logger.log(`pg-boss initialized: ${bossProvider ? 'OK' : 'FAILED'}`);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  await app.listen(port);
  logger.log(`🚀 STT-IA Server running on http://localhost:${port}`);
  logger.log(`📋 Endpoints:`);
  logger.log(`   POST /api/auth/login      → Authenticate and get JWT`);
  logger.log(`   POST /api/process          → Upload audio for processing`);
  logger.log(`   GET  /api/status/:jobId    → Check processing status`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down gracefully...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
