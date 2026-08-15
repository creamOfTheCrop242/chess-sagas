import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  createOpenAiGenerationClient,
  logOpenAiGeneration,
  logOpenAiGenerationFailure,
  losslessPayloadCompactionEnabled,
  type ModelPayloadOptions,
  promptCacheOptions,
  serializeRequestWithoutTelemetry,
} from '../openai/openai-generation';
import { OpenAiTelemetryService } from '../openai/openai-telemetry.service';
import {
  storyValidationResultSchema,
  type StoryValidationResult,
} from './models/story-validation';
import {
  PROHIBITED_PROSE_TERMS,
  STORY_VALIDATION_INSTRUCTIONS,
} from './story-validation.prompt';
import type {
  StoryValidationProvider,
  StoryValidationRequest,
} from './story-validation.provider';

@Injectable()
export class OpenAiStoryValidationProvider implements StoryValidationProvider {
  readonly model: string;
  private readonly logger = new Logger(OpenAiStoryValidationProvider.name);
  private readonly client: OpenAI | null;
  private readonly payloadOptions: ModelPayloadOptions;

  constructor(
    config: ConfigService,
    private readonly telemetryRecorder: OpenAiTelemetryService,
  ) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.model = config.get<string>('STORY_VALIDATION_MODEL') || 'gpt-5.6-sol';
    this.client = apiKey ? createOpenAiGenerationClient(apiKey, config) : null;
    this.payloadOptions = {
      deduplicateBoardSnapshots: losslessPayloadCompactionEnabled(config),
    };
  }

  async validate(
    request: StoryValidationRequest,
  ): Promise<StoryValidationResult> {
    if (!this.client)
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    const startedAt = Date.now();
    const input = serializeRequestWithoutTelemetry(
      request,
      this.payloadOptions,
    );
    const callTelemetry = {
      ...request.telemetry,
      payloadBytes: Buffer.byteLength(input, 'utf8'),
    };
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        ...promptCacheOptions(this.model, 'chess-sagas:story-validation'),
        reasoning: { effort: 'medium' },
        instructions: `${STORY_VALIDATION_INSTRUCTIONS}

${PROHIBITED_PROSE_TERMS}`,
        input,
        max_output_tokens: 18_000,
        text: {
          format: zodTextFormat(
            storyValidationResultSchema,
            'story_validation',
          ),
        },
      });
      if (!response.output_parsed)
        throw new BadGatewayException('OpenAI returned no validation result');
      const validation = storyValidationResultSchema.parse(
        response.output_parsed,
      );
      logOpenAiGeneration(
        this.logger,
        'story-validation',
        this.model,
        startedAt,
        response,
        callTelemetry,
        this.telemetryRecorder,
      );
      return validation;
    } catch (error) {
      logOpenAiGenerationFailure(
        this.logger,
        'story-validation',
        this.model,
        startedAt,
        error,
        callTelemetry,
        this.telemetryRecorder,
      );
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof BadGatewayException
      )
        throw error;
      throw new BadGatewayException(
        error instanceof Error ? error.message : 'Story validation failed',
      );
    }
  }
}
