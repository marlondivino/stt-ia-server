import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as path from 'path';

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
  fullText: string;
  language: string;
  languageProbability: number;
}

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);
  private readonly pythonPath: string;
  private readonly scriptPath: string;
  private readonly modelSize: string;
  private readonly device: string;
  private readonly computeType: string;

  constructor(private readonly configService: ConfigService) {
    this.pythonPath = this.configService.get<string>('PYTHON_PATH', 'python');
    this.scriptPath = path.resolve('scripts', 'transcribe.py');
    this.modelSize = this.configService.get<string>('WHISPER_MODEL_SIZE', 'base');
    this.device = this.configService.get<string>('WHISPER_DEVICE', 'cuda');
    this.computeType = this.configService.get<string>('WHISPER_COMPUTE_TYPE', 'float16');
  }

  async transcribe(filePath: string): Promise<TranscriptionResult> {
    return new Promise<TranscriptionResult>((resolve, reject) => {
      const args = [
        this.scriptPath,
        filePath,
        '--model-size', this.modelSize,
        '--device', this.device,
        '--compute-type', this.computeType,
      ];

      this.logger.debug(
        `Spawning: ${this.pythonPath} ${args.join(' ')}`,
      );

      const process = spawn(this.pythonPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      process.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      process.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
        // Log stderr output in real-time for debugging
        const line = chunk.toString().trim();
        if (line) {
          this.logger.debug(`[whisper stderr] ${line}`);
        }
      });

      process.on('error', (error) => {
        reject(
          new Error(
            `Failed to spawn Python process: ${error.message}. ` +
            `Ensure "${this.pythonPath}" is installed and accessible.`,
          ),
        );
      });

      process.on('close', (code) => {
        const stderr = Buffer.concat(stderrChunks).toString().trim();

        if (code !== 0) {
          reject(
            new Error(
              `Transcription failed with exit code ${code}. ` +
              `stderr: ${stderr || '(empty)'}`,
            ),
          );
          return;
        }

        const stdout = Buffer.concat(stdoutChunks).toString().trim();

        if (!stdout) {
          reject(new Error('Transcription returned empty output'));
          return;
        }

        try {
          const result = JSON.parse(stdout);

          const transcriptionResult: TranscriptionResult = {
            segments: result.segments || [],
            fullText: result.full_text || '',
            language: result.language || 'unknown',
            languageProbability: result.language_probability || 0,
          };

          resolve(transcriptionResult);
        } catch (parseError) {
          reject(
            new Error(
              `Failed to parse transcription JSON: ${
                parseError instanceof Error
                  ? parseError.message
                  : String(parseError)
              }. Raw output: ${stdout.substring(0, 500)}`,
            ),
          );
        }
      });
    });
  }
}
