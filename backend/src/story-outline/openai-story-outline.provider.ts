import { buildAllegianceContext } from '../chess/allegiance-context';
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
  serializeRequestWithCharacterRegistry,
} from '../openai/openai-generation';
import { OpenAiTelemetryService } from '../openai/openai-telemetry.service';
import type {
  StoryOutlineProvider,
  StoryOutlineRequest,
} from './story-outline.provider';
import { storyOutlineSchema, type StoryOutline } from './models/story-outline';
import { STORY_OUTLINE_INSTRUCTIONS } from './story-outline.prompt';

@Injectable()
export class OpenAiStoryOutlineProvider implements StoryOutlineProvider {
  readonly model: string;
  private readonly logger = new Logger(OpenAiStoryOutlineProvider.name);
  private readonly client: OpenAI | null;
  private readonly payloadOptions: ModelPayloadOptions;

  constructor(
    config: ConfigService,
    private readonly telemetryRecorder: OpenAiTelemetryService,
  ) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.model = config.get<string>('STORY_OUTLINE_MODEL') || 'gpt-5.6-luna';
    this.client = apiKey ? createOpenAiGenerationClient(apiKey, config) : null;
    this.payloadOptions = {
      deduplicateBoardSnapshots: losslessPayloadCompactionEnabled(config),
    };
  }

  async generate(request: StoryOutlineRequest): Promise<StoryOutline> {
    if (!this.client) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    }
    const startedAt = Date.now();
    const input = serializeRequestWithCharacterRegistry(
      {
        ...request,
        allegianceContext: buildAllegianceContext(
          request.ledger,
          request.narrativeAnalysis.relationshipPlans,
        ),
      },
      this.payloadOptions,
    );
    const callTelemetry = {
      ...request.telemetry,
      payloadBytes: Buffer.byteLength(input, 'utf8'),
    };
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        ...promptCacheOptions(this.model, 'chess-sagas:story-outline'),
        reasoning: { effort: 'medium' },
        instructions: STORY_OUTLINE_INSTRUCTIONS,
        input,
        text: {
          format: zodTextFormat(storyOutlineSchema, 'story_outline'),
        },
      });
      if (!response.output_parsed) {
        throw new BadGatewayException('OpenAI returned no story outline');
      }
      const outline = storyOutlineSchema.parse(response.output_parsed);
      logOpenAiGeneration(
        this.logger,
        'story-outline',
        this.model,
        startedAt,
        response,
        callTelemetry,
        this.telemetryRecorder,
      );
      return outline;
    } catch (error) {
      logOpenAiGenerationFailure(
        this.logger,
        'story-outline',
        this.model,
        startedAt,
        error,
        callTelemetry,
        this.telemetryRecorder,
      );
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }
      throw new BadGatewayException(
        error instanceof Error ? error.message : 'OpenAI story outline failed',
      );
    }
  }
}
