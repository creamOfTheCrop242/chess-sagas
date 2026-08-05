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
  promptCacheOptions,
  serializeRequestWithoutTelemetry,
} from '../openai/openai-generation';
import {
  sceneBreakdownSchema,
  type SceneBreakdown,
} from './models/scene-breakdown';
import { SCENE_BREAKDOWN_INSTRUCTIONS } from './scene-breakdown.prompt';
import type { SceneBreakdownProvider } from './scene-breakdown.provider';

@Injectable()
export class OpenAiSceneBreakdownProvider implements SceneBreakdownProvider {
  readonly model: string;
  private readonly logger = new Logger(OpenAiSceneBreakdownProvider.name);
  private readonly client: OpenAI | null;
  constructor(config: ConfigService) {
    const key = config.get<string>('OPENAI_API_KEY');
    this.model = config.get<string>('SCENE_BREAKDOWN_MODEL') || 'gpt-5.6-sol';
    this.client = key ? createOpenAiGenerationClient(key, config) : null;
  }
  async generate(
    input: Parameters<SceneBreakdownProvider['generate']>[0],
  ): Promise<SceneBreakdown> {
    if (!this.client)
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    const startedAt = Date.now();
    const serializedInput = serializeRequestWithoutTelemetry(input);
    const callTelemetry = {
      ...input.telemetry,
      payloadBytes: Buffer.byteLength(serializedInput, 'utf8'),
    };
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        ...promptCacheOptions(this.model, 'chess-sagas:scene-breakdown'),
        reasoning: { effort: 'medium' },
        instructions: SCENE_BREAKDOWN_INSTRUCTIONS,
        input: serializedInput,
        max_output_tokens: 16000,
        text: {
          verbosity: 'high',
          format: zodTextFormat(sceneBreakdownSchema, 'scene_breakdown'),
        },
      });
      if (!response.output_parsed)
        throw new BadGatewayException('OpenAI returned no scene breakdown');
      const breakdown = sceneBreakdownSchema.parse(response.output_parsed);
      logOpenAiGeneration(
        this.logger,
        'scene-breakdown',
        this.model,
        startedAt,
        response,
        callTelemetry,
      );
      return breakdown;
    } catch (error) {
      logOpenAiGenerationFailure(
        this.logger,
        'scene-breakdown',
        this.model,
        startedAt,
        error,
        callTelemetry,
      );
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
