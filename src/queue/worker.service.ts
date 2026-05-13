import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { BossProvider } from './boss.provider';
import { TranscriptionService } from '../services/transcription.service';
import { SummarizationService } from '../services/summarization.service';
import * as fs from 'fs/promises';
import PgBoss from 'pg-boss';

interface AudioJobData {
  filePath: string;
  originalName: string;
}

interface AudioJobResult {
  transcription: string;
  segments: Array<{ start: number; end: number; text: string }>;
  language: string;
  summary: string;
}

@Injectable()
export class WorkerService implements OnModuleInit {
  private readonly logger = new Logger(WorkerService.name);

  constructor(
    private readonly bossProvider: BossProvider,
    private readonly transcriptionService: TranscriptionService,
    private readonly summarizationService: SummarizationService,
  ) {}

  async onModuleInit() {
    const boss = this.bossProvider.getInstance();

    // pg-boss v10: batchSize controls how many jobs are fetched per poll
    // Using batchSize: 1 to process one job at a time (serial processing)
    await boss.work<AudioJobData>(
      'audio-processing',
      {
        batchSize: 1,
        pollingIntervalSeconds: 2,
      },
      async (jobs: PgBoss.Job<AudioJobData>[]) => {
        // batchSize: 1 means we always get exactly one job
        for (const job of jobs) {
          await this.handleJob(job);
        }
      },
    );

    this.logger.log(
      '🎧 Worker registered for queue "audio-processing" (batchSize: 1, serial processing)',
    );
  }

  private async handleJob(
    job: PgBoss.Job<AudioJobData>,
  ): Promise<void> {
    const { filePath, originalName } = job.data;
    const boss = this.bossProvider.getInstance();

    this.logger.log(
      `🔄 Processing job ${job.id} | File: ${originalName}`,
    );

    try {
      // ── Step 1: Transcription via faster-whisper ──────────────────
      this.logger.log(`[${job.id}] Starting transcription...`);
      const transcriptionResult =
        await this.transcriptionService.transcribe(filePath);

      this.logger.log(
        `[${job.id}] Transcription complete | Language: ${transcriptionResult.language} | Segments: ${transcriptionResult.segments.length}`,
      );

      // ── Step 2: Summarization via Ollama ──────────────────────────
      this.logger.log(`[${job.id}] Starting summarization...`);
      const summary = await this.summarizationService.summarize(
        transcriptionResult.fullText,
      );

      this.logger.log(
        `[${job.id}] Summarization complete | Summary length: ${summary.length} chars`,
      );

      // ── Mark job as completed with output data ────────────────────
      const result: AudioJobResult = {
        transcription: transcriptionResult.fullText,
        segments: transcriptionResult.segments,
        language: transcriptionResult.language,
        summary,
      };

      await boss.complete('audio-processing', job.id, result);

      this.logger.log(`✅ Job ${job.id} completed successfully`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `❌ Job ${job.id} failed: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Mark the job as failed with error details
      await boss.fail('audio-processing', job.id, { message: errorMessage });
    } finally {
      // ── Cleanup: delete temporary audio file ──────────────────────
      await this.cleanupFile(filePath, job.id);
    }
  }

  private async cleanupFile(filePath: string, jobId: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      this.logger.log(`🗑️  [${jobId}] Cleaned up file: ${filePath}`);
    } catch (unlinkError) {
      // File may already be deleted or inaccessible — log but don't fail
      this.logger.warn(
        `[${jobId}] Failed to cleanup file ${filePath}: ${
          unlinkError instanceof Error
            ? unlinkError.message
            : String(unlinkError)
        }`,
      );
    }
  }
}
