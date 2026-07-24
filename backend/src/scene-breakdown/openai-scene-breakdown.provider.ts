import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  sceneBreakdownSchema,
  type SceneBreakdown,
} from './models/scene-breakdown';
import { SCENE_BREAKDOWN_INSTRUCTIONS } from './scene-breakdown.prompt';
import type { SceneBreakdownProvider } from './scene-breakdown.provider';

@Injectable()
export class OpenAiSceneBreakdownProvider implements SceneBreakdownProvider {
  readonly model: string;
  private readonly client: OpenAI | null;
  constructor(config: ConfigService) {
    const key = config.get<string>('OPENAI_API_KEY');
    this.model = config.get<string>('SCENE_BREAKDOWN_MODEL') || 'gpt-5.6-sol';
    this.client = key ? new OpenAI({ apiKey: key }) : null;
  }
  async generate(
    input: Parameters<SceneBreakdownProvider['generate']>[0],
  ): Promise<SceneBreakdown> {
    if (!this.client)
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        reasoning: { effort: 'medium' },
        instructions: SCENE_BREAKDOWN_INSTRUCTIONS,
        input: JSON.stringify(input),
        max_output_tokens: 16000,
        text: {
          verbosity: 'high',
          format: zodTextFormat(sceneBreakdownSchema, 'scene_breakdown'),
        },
      });
      if (!response.output_parsed)
        throw new BadGatewayException('OpenAI returned no scene breakdown');
      return sceneBreakdownSchema.parse(response.output_parsed);
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof BadGatewayException
      )
        throw error;
      throw new BadGatewayException(
        error instanceof Error ? error.message : 'Scene breakdown failed',
      );
    }
  }
}
