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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiProperty,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProcessingService, JobStatusResponse } from './processing.service';

class FileUploadDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'Audio file to process' })
  audio!: any;
}

@ApiTags('Processing')
@ApiBearerAuth('JWT-auth')
@Controller()
@UseGuards(JwtAuthGuard)
export class ProcessingController {
  constructor(
    private readonly processingService: ProcessingService,
  ) {}

  @Post('process')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload audio file for processing' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Audio file to be transcribed and summarized',
    type: FileUploadDto,
  })
  @ApiResponse({ status: 201, description: 'Job created successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid file or missing field.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
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

    const normalizedPath = path.normalize(file.path);

    const { jobId } = await this.processingService.createJob(
      normalizedPath,
      file.originalname,
    );

    return {
      jobId,
      status: 'processing',
      message: 'Audio file queued for transcription and summarization.',
    };
  }

  @Get('status/:jobId')
  @ApiOperation({ summary: 'Get job status and results' })
  @ApiResponse({ status: 200, description: 'Return job status and results (if completed).' })
  @ApiResponse({ status: 404, description: 'Job not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getStatus(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
  ): Promise<JobStatusResponse> {
    return this.processingService.getJobStatus(jobId);
  }
}
