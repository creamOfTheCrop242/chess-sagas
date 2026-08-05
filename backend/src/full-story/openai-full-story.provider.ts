import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import {
  createOpenAiGenerationClient,
  logOpenAiGeneration,
  logOpenAiGenerationFailure,
  promptCacheOptions,
  serializeRequestWithCharacterRegistry,
} from '../openai/openai-generation';
import type {
  FullStoryProvider,
  FullStoryRequest,
  WoundSceneRepairRequest,
  WoundSceneRepairResult,
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
  private readonly woundRepairModel: string;
  private readonly logger = new Logger(OpenAiFullStoryProvider.name);
  private readonly client: OpenAI | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.model = config.get<string>('FULL_STORY_MODEL') || 'gpt-5.6-terra';
    this.woundRepairModel =
      config.get<string>('WOUND_SCENE_REPAIR_MODEL') || 'gpt-5.6-luna';
    this.client = apiKey ? createOpenAiGenerationClient(apiKey, config) : null;
  }

  async generate(request: FullStoryRequest): Promise<GeneratedStoryPackage> {
    if (!this.client) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    }
    const startedAt = Date.now();
    const input = serializeRequestWithCharacterRegistry(request);
    const callTelemetry = {
      ...request.telemetry,
      payloadBytes: Buffer.byteLength(input, 'utf8'),
    };
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        ...promptCacheOptions(this.model, 'chess-sagas:full-story'),
        reasoning: { effort: 'medium' },
        instructions: `${FULL_STORY_INSTRUCTIONS}

${EPILOGUE_INSTRUCTIONS}`,
        input,
        max_output_tokens: 64_000,
        text: {
          verbosity: 'high',
          format: zodTextFormat(
            generatedStoryPackageSchema,
            'generated_story_package',
          ),
        },
      });
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
      const storyPackage = generatedStoryPackageSchema.parse(
        response.output_parsed,
      );
      logOpenAiGeneration(
        this.logger,
        'full-story',
        this.model,
        startedAt,
        response,
        callTelemetry,
      );
      return storyPackage;
    } catch (error) {
      logOpenAiGenerationFailure(
        this.logger,
        'full-story',
        this.model,
        startedAt,
        error,
        callTelemetry,
      );
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

  async repairWoundScenes(
    request: WoundSceneRepairRequest,
  ): Promise<WoundSceneRepairResult> {
    if (!this.client) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    }
    const startedAt = Date.now();
    const { telemetry, ...modelRequest } = request;
    const input = JSON.stringify(modelRequest);
    const callTelemetry = {
      ...telemetry,
      repairMode: 'partial' as const,
      payloadBytes: Buffer.byteLength(input, 'utf8'),
    };
    try {
      const response = await this.client.responses.parse({
        model: this.woundRepairModel,
        ...promptCacheOptions(
          this.woundRepairModel,
          'chess-sagas:wound-scene-repair',
        ),
        reasoning: { effort: 'low' },
        instructions: `Repair only the supplied wound-warning scenes. Return exactly one replacement for every supplied scene and preserve each ply.

The structured wounds, woundTimeline, captureManifest, character registry, deaths, captors, victims, names, dialogue continuity, setting, and scene outcome are authoritative. Do not alter a capture, death, promotion, allegiance, or character identity.

For a wound inflicted in the scene, order the prose as: character acts without that new wound; concrete cause occurs; wound happens for the first time; consequences follow. Never call the character, body part, armor, machine, or movement damaged, wounded, broken, impaired, painful, unstable, or limited before the cause occurs.

An earlier wound may remain active. Do not erase it or confuse it with a later planned wound. If a warning is a false positive because the prose describes an already-active earlier wound or a different named character, preserve that valid continuity while clarifying ownership.

Return publishable replacement narration only. Do not explain the edit.`,
        input,
        max_output_tokens: 12_000,
        text: {
          verbosity: 'high',
          format: zodTextFormat(
            woundSceneRepairResultSchema,
            'wound_scene_repairs',
          ),
        },
      });
      if (!response.output_parsed) {
        throw new BadGatewayException(
          response.error?.message || 'OpenAI returned no wound scene repairs',
        );
      }
      const result = woundSceneRepairResultSchema.parse(response.output_parsed);
      logOpenAiGeneration(
        this.logger,
        'wound-scene-repair',
        this.woundRepairModel,
        startedAt,
        response,
        callTelemetry,
      );
      return result;
    } catch (error) {
      logOpenAiGenerationFailure(
        this.logger,
        'wound-scene-repair',
        this.woundRepairModel,
        startedAt,
        error,
        callTelemetry,
      );
      throw error;
    }
  }
}

const woundSceneRepairResultSchema = z.object({
  scenes: z.array(
    z.object({
      ply: z.number().int().positive(),
      fantasyNarration: z.string().min(1),
    }),
  ),
});
