import { Module, Global } from '@nestjs/common';
import { BossProvider } from './boss.provider';
import { WorkerService } from './worker.service';
import { TranscriptionService } from '../services/transcription.service';
import { SummarizationService } from '../services/summarization.service';

@Global()
@Module({
  providers: [BossProvider, WorkerService, TranscriptionService, SummarizationService],
  exports: [BossProvider],
})
export class QueueModule {}
