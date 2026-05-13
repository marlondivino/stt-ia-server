import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProcessingService, JobStatusResponse } from './processing.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ProcessingController {
  constructor(
    private readonly processingService: ProcessingService,
  ) {}

  @Post('process')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadDir = path.resolve(
            process.env.UPLOAD_DIR || './uploads',
          );
          cb(null, uploadDir);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname);
          const uniqueName = `${uuidv4()}${ext}`;
          cb(null, uniqueName);
        },
      }),
      fileFilter: (_req, file, cb) => {
        // Accept any audio MIME type
        if (file.mimetype.startsWith('audio/')) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Invalid file type "${file.mimetype}". Only audio files are accepted.`,
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024,
      },
    }),
  )
  async processAudio(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        'No audio file provided. Use form field "audio".',
      );
    }

    const { jobId } = await this.processingService.createJob(
      file.path,
      file.originalname,
    );

    return {
      jobId,
      status: 'processing',
      message: 'Audio file queued for transcription and summarization.',
    };
  }

  @Get('status/:jobId')
  async getStatus(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
  ): Promise<JobStatusResponse> {
    return this.processingService.getJobStatus(jobId);
  }
}
