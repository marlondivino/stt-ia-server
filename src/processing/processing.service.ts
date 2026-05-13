import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BossProvider } from '../queue/boss.provider';

export interface JobStatusResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  createdOn?: string;
  completedOn?: string;
  data?: {
    originalName: string;
  };
  result?: {
    transcription: string;
    segments: Array<{ start: number; end: number; text: string }>;
    language: string;
    summary: string;
  };
  error?: string;
}

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(private readonly bossProvider: BossProvider) {}

  async createJob(
    filePath: string,
    originalName: string,
  ): Promise<{ jobId: string }> {
    const boss = this.bossProvider.getInstance();

    const jobId = await boss.send('audio-processing', {
      filePath,
      originalName,
    });

    if (!jobId) {
      throw new Error('Failed to create job — pg-boss returned null');
    }

    this.logger.log(
      `📨 Job created: ${jobId} | File: ${originalName}`,
    );

    return { jobId };
  }

  async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    const boss = this.bossProvider.getInstance();

    // pg-boss v10: getJobById requires (name, id)
    const job = await boss.getJobById('audio-processing', jobId);

    if (!job) {
      throw new NotFoundException(`Job "${jobId}" not found`);
    }

    const stateMap: Record<string, JobStatusResponse['status']> = {
      created: 'queued',
      retry: 'queued',
      active: 'processing',
      completed: 'completed',
      failed: 'failed',
    };

    const status = stateMap[job.state] || 'queued';

    const response: JobStatusResponse = {
      jobId: job.id,
      status,
      createdOn: job.createdOn?.toISOString(),
      completedOn: job.completedOn?.toISOString(),
      data: {
        originalName: (job.data as any)?.originalName || 'unknown',
      },
    };

    if (status === 'completed' && job.output) {
      response.result = job.output as any;
    }

    if (status === 'failed' && job.output) {
      response.error =
        typeof job.output === 'object'
          ? (job.output as any).message || JSON.stringify(job.output)
          : String(job.output);
    }

    return response;
  }
}
