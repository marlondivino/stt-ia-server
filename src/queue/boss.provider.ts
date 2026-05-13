import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as PgBoss from 'pg-boss';

@Injectable()
export class BossProvider implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BossProvider.name);
  private boss: PgBoss;

  constructor(private readonly configService: ConfigService) {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');

    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    const retentionDays = this.configService.get<number>('JOB_RETENTION_DAYS', 365);
    const archiveSeconds = retentionDays * 24 * 60 * 60;

    this.boss = new PgBoss({
      connectionString: databaseUrl,
      archiveCompletedAfterSeconds: archiveSeconds,
      archiveFailedAfterSeconds: archiveSeconds,
      retryLimit: 0, // No automatic retries — failed is final
    });

    // pg-boss internal error logging
    this.boss.on('error', (error) => {
      this.logger.error(`pg-boss error: ${error.message}`, error.stack);
    });
  }

  async onModuleInit() {
    this.logger.log('Starting pg-boss...');
    await this.boss.start();
    
    // Ensure the queue is created with specific configurations if needed
    await this.boss.createQueue('audio-processing');
    
    this.logger.log('✅ pg-boss started and queue "audio-processing" ensured');
  }

  async onModuleDestroy() {
    this.logger.log('Stopping pg-boss...');
    await this.boss.stop({ graceful: true, timeout: 30_000 });
    this.logger.log('pg-boss stopped');
  }

  getInstance(): PgBoss {
    return this.boss;
  }
}
