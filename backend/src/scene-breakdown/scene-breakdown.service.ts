import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { GenerationPreparationService } from '../generation/generation-preparation.service';
import { storyOutlineSchema } from '../story-outline/models/story-outline';
import { sceneBreakdownSchema } from './models/scene-breakdown';
import {
  SCENE_BREAKDOWN_PROVIDER,
  type SceneBreakdownProvider,
} from './scene-breakdown.provider';
import { SCENE_BREAKDOWN_PROMPT_VERSION } from './scene-breakdown.prompt';
import { SceneBreakdownValidator } from './scene-breakdown.validator';
import { FULL_STORY_PROMPT_VERSION } from '../full-story/full-story.prompt';

@Injectable()
export class SceneBreakdownService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preparation: GenerationPreparationService,
    @Inject(SCENE_BREAKDOWN_PROVIDER)
    private readonly provider: SceneBreakdownProvider,
    private readonly validator: SceneBreakdownValidator,
  ) {}

  async generate(gameId: string) {
    return this.preparation.runStageOnce(gameId, 'SCENE_BREAKDOWN', () =>
      this.generateOnce(gameId),
    );
  }

  private async generateOnce(gameId: string) {
    const [prepared, outlineRun, validationRun, storyRun] = await Promise.all([
      this.preparation.prepare(gameId),
      this.prisma.generationRun.findFirst({
        where: { gameId, currentStage: 'OUTLINE', status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        include: { storyOutline: true },
      }),
      this.prisma.generationRun.findFirst({
        where: { gameId, currentStage: 'VALIDATION', status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        include: { storyValidation: true },
      }),
      this.prisma.generationRun.findFirst({
        where: { gameId, currentStage: 'STORY', status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        include: { generatedStory: true, sceneBreakdown: true },
      }),
    ]);
    if (!outlineRun?.storyOutline)
      throw new NotFoundException('Validated outline required');
    if (!validationRun?.storyValidation?.valid)
      throw new NotFoundException('Valid Phase 5 story required');
    if (!storyRun?.generatedStory)
      throw new NotFoundException('Generated story required');
    const run = await this.prisma.generationRun.create({
      data: {
        gameId,
        status: 'RUNNING',
        currentStage: 'SCENE_BREAKDOWN',
        model: this.provider.model,
        promptVersion: SCENE_BREAKDOWN_PROMPT_VERSION,
      },
    });
    try {
      const { ledger } = prepared;
      if (!storyRun.sceneBreakdown) {
        throw new NotFoundException('Structured story ending state required');
      }
      const storyBreakdown = sceneBreakdownSchema.parse(
        storyRun.sceneBreakdown.data,
      );
      const generatedBreakdown = await this.provider.generate({
        ledger,
        outline: storyOutlineSchema.parse(outlineRun.storyOutline.data),
        validatedStoryMarkdown:
          validationRun.storyValidation.repairedStoryMarkdown ||
          storyRun.generatedStory.storyMarkdown,
        endingState: {
          defeatedKingFate: storyBreakdown.defeatedKingFate,
          defeatedSealFate: storyBreakdown.defeatedSealFate,
          defeatedKingDeathDescription:
            storyBreakdown.defeatedKingDeathDescription,
        },
        telemetry: {
          gameId,
          generationRunId: run.id,
          attempt: 1,
          repairMode: 'none',
        },
      });
      const breakdown = sceneBreakdownSchema.parse({
        ...generatedBreakdown,
        scenes: generatedBreakdown.scenes.map((scene) => {
          const event = ledger.events[scene.startPly - 1];
          return {
            ...scene,
            captureActorId: event?.isCapture ? event.pieceId : null,
            captureVictimId: event?.capturedPieceId ?? null,
          };
        }),
        defeatedKingFate: storyBreakdown.defeatedKingFate,
        defeatedSealFate: storyBreakdown.defeatedSealFate,
        defeatedKingDeathDescription:
          storyBreakdown.defeatedKingDeathDescription,
      });
      this.validator.validate(breakdown, ledger);
      const data = JSON.parse(
        JSON.stringify(breakdown),
      ) as Prisma.InputJsonValue;
      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          error: null,
          sceneBreakdown: { create: { schemaVersion: 1, data } },
        },
      });
      return this.prisma.generationRun.findUnique({
        where: { id: run.id },
        include: { sceneBreakdown: true },
      });
    } catch (error) {
      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error:
            error instanceof Error ? error.message : 'Scene generation failed',
        },
      });
      throw error;
    }
  }

  async findLatest(gameId: string) {
    const [run, analysisRun] = await Promise.all([
      this.prisma.generationRun.findFirst({
        where: {
          gameId,
          status: 'COMPLETED',
          OR: [
            {
              currentStage: 'STORY',
              promptVersion: FULL_STORY_PROMPT_VERSION,
            },
            {
              currentStage: 'SCENE_BREAKDOWN',
              promptVersion: SCENE_BREAKDOWN_PROMPT_VERSION,
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
        include: { sceneBreakdown: true },
      }),
      this.prisma.generationRun.findFirst({
        where: {
          gameId,
          status: 'COMPLETED',
          currentStage: 'NARRATIVE_ANALYSIS',
          narrativeAnalysis: { isNot: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { narrativeAnalysis: { select: { data: true } } },
      }),
    ]);
    if (!run)
      throw new NotFoundException('No completed scene breakdown exists');
    const analysis = analysisRun?.narrativeAnalysis?.data;
    return {
      ...run,
      battlefieldEnvironment:
        analysis && typeof analysis === 'object'
          ? ((analysis as { battlefieldEnvironment?: unknown })
              .battlefieldEnvironment ?? null)
          : null,
    };
  }
}
