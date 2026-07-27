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
  promptCacheOptions,
  serializeRequestWithCharacterRegistry,
} from '../openai/openai-generation';
import type {
  FullStoryProvider,
  FullStoryRequest,
} from './full-story.provider';
import {
  EPILOGUE_INSTRUCTIONS,
  FULL_STORY_INSTRUCTIONS,
} from './full-story.prompt';
import {
  generatedStoryPackageSchema,
  type GeneratedStoryPackage,
} from './models/generated-story';

@Injectable()
export class OpenAiFullStoryProvider implements FullStoryProvider {
  readonly model: string;
  private readonly logger = new Logger(OpenAiFullStoryProvider.name);
  private readonly client: OpenAI | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.model = config.get<string>('FULL_STORY_MODEL') || 'gpt-5.6-terra';
    this.client = apiKey ? createOpenAiGenerationClient(apiKey, config) : null;
  }

  async generate(request: FullStoryRequest): Promise<GeneratedStoryPackage> {
    if (!this.client) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    }
    const startedAt = Date.now();
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        ...promptCacheOptions(this.model, 'chess-sagas:full-story'),
        reasoning: { effort: 'medium' },
        instructions: `${FULL_STORY_INSTRUCTIONS}

${EPILOGUE_INSTRUCTIONS}`,
        input: serializeRequestWithCharacterRegistry(request),
        max_output_tokens: 64_000,
        text: {
          verbosity: 'high',
          format: zodTextFormat(
            generatedStoryPackageSchema,
            'generated_story_package',
          ),
        },
      });
      logOpenAiGeneration(
        this.logger,
        'full-story',
        this.model,
        startedAt,
        response,
      );
      if (!response.output_parsed) {
        if (response.incomplete_details?.reason) {
          throw new BadGatewayException(
            `OpenAI story generation was incomplete: ${response.incomplete_details.reason}`,
          );
        }
        if (response.error) {
          throw new BadGatewayException(
            `OpenAI story generation failed: ${response.error.message}`,
          );
        }
        throw new BadGatewayException('OpenAI returned no full story');
      }
      return generatedStoryPackageSchema.parse(response.output_parsed);
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }
      throw new BadGatewayException(
        error instanceof Error
          ? error.message
          : 'OpenAI story generation failed',
      );
    }
  }
}
