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
  losslessPayloadCompactionEnabled,
  type ModelPayloadOptions,
  promptCacheOptions,
  serializeRequestWithCharacterRegistry,
} from '../openai/openai-generation';
import { OpenAiTelemetryService } from '../openai/openai-telemetry.service';
import type {
  FullStoryProvider,
  FullStoryRequest,
  SemanticDeathAdjudicationRequest,
  SemanticDeathAdjudicationResult,
  StorySceneRepairRequest,
  StorySceneRepairResult,
  StorySectionRepairRequest,
  StorySectionRepairResult,
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

const semanticDeathAdjudicationResultSchema = z.object({
  findings: z.array(
    z.object({
      findingIndex: z.number().int().nonnegative(),
      contradiction: z.boolean(),
      confidence: z.enum(['high', 'medium', 'low']),
      rationale: z.string().min(1),
    }),
  ),
});

@Injectable()
export class OpenAiFullStoryProvider implements FullStoryProvider {
  readonly model: string;
  private readonly woundRepairModel: string;
  private readonly logger = new Logger(OpenAiFullStoryProvider.name);
  private readonly client: OpenAI | null;
  private readonly payloadOptions: ModelPayloadOptions;

  constructor(
    config: ConfigService,
    private readonly telemetryRecorder: OpenAiTelemetryService,
  ) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.model = config.get<string>('FULL_STORY_MODEL') || 'gpt-5.6-terra';
    this.woundRepairModel =
      config.get<string>('WOUND_SCENE_REPAIR_MODEL') || 'gpt-5.6-luna';
    this.client = apiKey ? createOpenAiGenerationClient(apiKey, config) : null;
    this.payloadOptions = {
      deduplicateBoardSnapshots: losslessPayloadCompactionEnabled(config),
    };
  }

  async generate(request: FullStoryRequest): Promise<GeneratedStoryPackage> {
    if (!this.client) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    }
    const startedAt = Date.now();
    const input = serializeRequestWithCharacterRegistry(
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
        this.telemetryRecorder,
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
        this.telemetryRecorder,
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

The structured wounds, woundTimeline, woundReferences, captureManifest, character registry, deaths, captors, victims, names, dialogue continuity, setting, and scene outcome are authoritative. Each woundTimeline catalog contract fixes its woundCatalogId, bodyArea, severity, requiredEffects, recoverability, cause, and narration guidance. Do not alter or substitute a wound reference, catalog injury family, capture, death, promotion, allegiance, or character identity.

repairContracts are acceptance requirements, not suggestions. Satisfy every contract for its exact ply and piece. When a contract says a character has no authorized wound, that character and—if the character is an embedded pilot—every integrated Fortress component must remain intact and operational throughout the replacement. Put dramatic damage on the ledger-authorized victim, enemy equipment, terrain, or structures instead. Recoil, impact, urgency, and difficult terrain may create danger, noise, or motion, but must not injure that character or damage her or his integrated machine. Do not merely replace one forbidden damage phrase with a synonym.

For a wound inflicted in the scene, order the prose as: character acts without that new wound; concrete cause occurs; wound happens for the first time; consequences follow. Never call the character, body part, armor, machine, or movement damaged, wounded, broken, impaired, painful, unstable, or limited before the cause occurs.

An earlier wound may remain active. Do not erase it or confuse it with a later planned wound. If a warning is a false positive because the prose describes an already-active earlier wound or a different named character, preserve that valid continuity while clarifying ownership.

When telemetry.attempt is 2, the supplied narration is the first rejected replacement and warnings describe what still failed. Directly remove the remaining contradiction; do not restore wording from the original scene.

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
        this.telemetryRecorder,
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
        this.telemetryRecorder,
      );
      throw error;
    }
  }

  async repairStoryScenes(
    request: StorySceneRepairRequest,
  ): Promise<StorySceneRepairResult> {
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
          'chess-sagas:story-scene-repair',
        ),
        reasoning: { effort: 'low' },
        instructions: `Repair only the supplied broken story scenes. Return exactly one replacement for every scene in scenes and preserve each ply. contextScenes are read-only continuity context and must not be returned or rewritten.

Every finding is authoritative. Correct it without changing any other event. The character registry, captureManifest, woundTimeline, checkStrainTimeline, selectedRevengePayoffs, structured scene fields, deaths, captors, victims, promotions, allegiances, and names are binding.

mythicArmContracts are absolute ownership rules for the supplied scenes. For every applicable ply, identify the Commander by pieceId and characterNames, then use only assignedArm for that Commander. The assigned arm's name, description, signatures, powers, recoil, and wound effects belong exclusively to that Commander. Remove or rewrite every forbiddenArms name, signature, power, recoil, or wound effect attributed to that Commander. Never solve a swap by merely exchanging character names or by transferring the scene's action to the other Commander; preserve the original actor and event while correcting the weapon and its effects.

fortressOperatingTimeline is also binding. During battle, operational and damaged-but-mobile Fortresses still have Seal power. Remove any cited premature claim that a surviving Fortress is depowered, magically dead, shut down by Seal failure, or unable to move because its magic is gone. Preserve legitimate planned damage and physical obstruction. If a hull blocks a route, describe it as damaged, stationary, wedged, terrain-pinned, or deliberately positioned only when supported by the existing scene; never invent premature power loss. A defeated realm's surviving Fortress becomes depowered only after its King dies at the end of the final scene.

The deathContracts are absolute and beat-local. authorizedVictimId is the only character who may die in that replacement; if it is null, nobody may die. Every character in mustRemainAlive must still be alive when the replacement ends. When deathCatalogId is present, preserve its decisiveActorId, method, targetArea, narrationGuidance, and forbiddenClaims rather than inventing a substitute death. Remove every cited fatal sentence, final breath, corpse, or pronoun-resolved death that violates this contract. An authorized checkmate death is narrative-only and is not a chess capture: preserve null capture IDs and victimDies=false unless captureManifest independently records a capture on that ply, but physically kill the defeated King through the selected catalog outcome before describing Royal Seal failure. On a second repair attempt, the supplied scene is the first rejected replacement: directly replace the cited remaining error instead of restoring earlier wording.

For captures, the manifest actor kills its victim; resistance by the victim must never reverse that outcome. For a selected revenge payoff, explicitly connect the capture to the named witnessed fallen ally while preserving the actual capture victim. Never kill a survivor or describe a future death early. Never reveal the Ascension Seal or its purpose before activation. Preserve all valid active wounds and do not introduce an unplanned or premature wound.

For every checkStrainTimeline entry, only damagedKingId receives the new strain caused by that check. protectedKingId does not receive damage from that event. Preserve earlier strain without inventing another increment on a later escape move.

Never expose board coordinates in reader-facing prose. When repairing a checkmate scene, summarize the fatal attacker and the important allied characters completing the encirclement, state that the King's remaining routes are blocked or controlled, and state that no defender can capture the attacker or interpose. The authorized defeated King must then die visibly on page from the final attack; never leave him alive, merely incapacitated, or awaiting death in the aftermath. Do not inventory individual escape squares.

Keep the original scene's voice, setting, useful dialogue, relationships, length, and narrative purpose wherever they do not conflict with a finding. Return publishable replacement narration only and do not explain the edit.`,
        input,
        max_output_tokens: 12_000,
        text: {
          verbosity: 'high',
          format: zodTextFormat(
            storySceneRepairResultSchema,
            'story_scene_repairs',
          ),
        },
      });
      if (!response.output_parsed) {
        throw new BadGatewayException(
          response.error?.message || 'OpenAI returned no story scene repairs',
        );
      }
      const result = storySceneRepairResultSchema.parse(response.output_parsed);
      logOpenAiGeneration(
        this.logger,
        'story-scene-repair',
        this.woundRepairModel,
        startedAt,
        response,
        callTelemetry,
        this.telemetryRecorder,
      );
      return result;
    } catch (error) {
      logOpenAiGenerationFailure(
        this.logger,
        'story-scene-repair',
        this.woundRepairModel,
        startedAt,
        error,
        callTelemetry,
        this.telemetryRecorder,
      );
      throw error;
    }
  }

  async adjudicatePossiblePrematureDeaths(
    request: SemanticDeathAdjudicationRequest,
  ): Promise<SemanticDeathAdjudicationResult> {
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
        reasoning: { effort: 'low' },
        instructions: `Adjudicate possible premature character deaths in fantasy battle prose. Return one result for every supplied findingIndex.

Set contradiction=true only when the scene explicitly says the named character dies before the permitted capture ply, refers to that character's death as already completed, or describes unmistakably fatal bodily destruction that cannot reasonably be read as a nonfatal impact or wound. For possessive references such as his death or her corpse, resolve whose death is described from the complete scene. Fear of death, a possible future death, negation, and references to someone else's death are not contradictions. A character being struck, thrown, winded, burned, cut, pierced in a non-vital area, hit by recoil, or feeling pain is not by itself a death. A weapon, spell, blast, or recoil going into or against a character's chest is not automatically fatal. Do not infer death from danger, severity, or dramatic language. If the wording is ambiguous or uncertain, set contradiction=false. Judge only whether the prose contradicts the supplied expected status; do not rewrite it and do not validate chess facts.`,
        input,
        max_output_tokens: 2_000,
        text: {
          verbosity: 'low',
          format: zodTextFormat(
            semanticDeathAdjudicationResultSchema,
            'semantic_death_adjudication',
          ),
        },
      });
      if (!response.output_parsed) {
        throw new BadGatewayException(
          response.error?.message ||
            'OpenAI returned no semantic death adjudication',
        );
      }
      const result = semanticDeathAdjudicationResultSchema.parse(
        response.output_parsed,
      );
      logOpenAiGeneration(
        this.logger,
        'semantic-death-adjudication',
        this.woundRepairModel,
        startedAt,
        response,
        callTelemetry,
        this.telemetryRecorder,
      );
      return result;
    } catch (error) {
      logOpenAiGenerationFailure(
        this.logger,
        'semantic-death-adjudication',
        this.woundRepairModel,
        startedAt,
        error,
        callTelemetry,
        this.telemetryRecorder,
      );
      throw error;
    }
  }

  async repairStorySections(
    request: StorySectionRepairRequest,
  ): Promise<StorySectionRepairResult> {
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
          'chess-sagas:story-section-repair',
        ),
        reasoning: { effort: 'low' },
        instructions: `Repair only the supplied broken reader-facing story sections. Return exactly one complete replacement for every supplied section and preserve every sectionId. Do not return or rewrite any section that was not supplied.

Every finding is authoritative. Remove the cited prohibited coordinate, chess terminology, or internal identifier while preserving the section's established events, characters, outcome, chronology, tone, approximate length, and purpose. The character registry and endingWorldState are binding. Do not change who lived, died, surrendered, won, was wounded, retained magic, or lost magic. Do not invent a capture, wound, promotion, relationship, survivor, or new ending consequence.

Use natural fantasy battlefield language. Never expose board coordinates, chess notation, internal piece IDs, SAN, FEN, files, ranks, plies, or the words chess or checkmate. Return publishable replacement text only and do not explain the edit.`,
        input,
        max_output_tokens: 12_000,
        text: {
          verbosity: 'high',
          format: zodTextFormat(
            storySectionRepairResultSchema,
            'story_section_repairs',
          ),
        },
      });
      if (!response.output_parsed) {
        throw new BadGatewayException(
          response.error?.message || 'OpenAI returned no story section repairs',
        );
      }
      const result = storySectionRepairResultSchema.parse(
        response.output_parsed,
      );
      logOpenAiGeneration(
        this.logger,
        'story-section-repair',
        this.woundRepairModel,
        startedAt,
        response,
        callTelemetry,
        this.telemetryRecorder,
      );
      return result;
    } catch (error) {
      logOpenAiGenerationFailure(
        this.logger,
        'story-section-repair',
        this.woundRepairModel,
        startedAt,
        error,
        callTelemetry,
        this.telemetryRecorder,
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

const storySceneRepairResultSchema = woundSceneRepairResultSchema;

const storySectionRepairResultSchema = z.object({
  sections: z.array(
    z.object({
      sectionId: z.string().min(1),
      text: z.string().min(1),
    }),
  ),
});
