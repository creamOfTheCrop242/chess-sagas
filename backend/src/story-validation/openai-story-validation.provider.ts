import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  storyValidationResultSchema,
  type StoryValidationResult,
} from './models/story-validation';
import { STORY_VALIDATION_INSTRUCTIONS } from './story-validation.prompt';
import type {
  StoryValidationProvider,
  StoryValidationRequest,
} from './story-validation.provider';

@Injectable()
export class OpenAiStoryValidationProvider implements StoryValidationProvider {
  readonly model: string;
  private readonly client: OpenAI | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.model = config.get<string>('STORY_VALIDATION_MODEL') || 'gpt-5.6-sol';
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async validate(
    request: StoryValidationRequest,
  ): Promise<StoryValidationResult> {
    if (!this.client)
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        reasoning: { effort: 'medium' },
        instructions: STORY_VALIDATION_INSTRUCTIONS,
        input: JSON.stringify(request),
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
      return storyValidationResultSchema.parse(response.output_parsed);
    } catch (error) {
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
