import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type {
  StoryOutlineProvider,
  StoryOutlineRequest,
} from './story-outline.provider';
import { storyOutlineSchema, type StoryOutline } from './models/story-outline';
import { STORY_OUTLINE_INSTRUCTIONS } from './story-outline.prompt';

@Injectable()
export class OpenAiStoryOutlineProvider implements StoryOutlineProvider {
  readonly model: string;
  private readonly client: OpenAI | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.model = config.get<string>('STORY_OUTLINE_MODEL') || 'gpt-5.6-luna';
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async generate(request: StoryOutlineRequest): Promise<StoryOutline> {
    if (!this.client) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    }
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        reasoning: { effort: 'medium' },
        instructions: STORY_OUTLINE_INSTRUCTIONS,
        input: JSON.stringify(request),
        text: {
          format: zodTextFormat(storyOutlineSchema, 'story_outline'),
        },
      });
      if (!response.output_parsed) {
        throw new BadGatewayException('OpenAI returned no story outline');
      }
      return storyOutlineSchema.parse(response.output_parsed);
    } catch (error) {
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
