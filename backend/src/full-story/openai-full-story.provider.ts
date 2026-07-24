import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type {
  FullStoryProvider,
  FullStoryRequest,
} from './full-story.provider';
import { FULL_STORY_INSTRUCTIONS } from './full-story.prompt';
import {
  generatedStoryPackageSchema,
  type GeneratedStoryPackage,
} from './models/generated-story';

@Injectable()
export class OpenAiFullStoryProvider implements FullStoryProvider {
  readonly model: string;
  private readonly client: OpenAI | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.model = config.get<string>('FULL_STORY_MODEL') || 'gpt-5.6-sol';
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async generate(request: FullStoryRequest): Promise<GeneratedStoryPackage> {
    if (!this.client) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    }
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        reasoning: { effort: 'medium' },
        instructions: FULL_STORY_INSTRUCTIONS,
        input: JSON.stringify(request),
        max_output_tokens: 16_000,
        text: {
          verbosity: 'high',
          format: zodTextFormat(
            generatedStoryPackageSchema,
            'generated_story_package',
          ),
        },
      });
      if (!response.output_parsed) {
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
