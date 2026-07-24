import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { GameLedger } from '../chess/models/game-ledger';
import { PrismaService } from '../database/prisma.service';
import { storyOutlineSchema } from '../story-outline/models/story-outline';
import { sceneBreakdownSchema } from './models/scene-breakdown';
import {
  SCENE_BREAKDOWN_PROVIDER,
  type SceneBreakdownProvider,
} from './scene-breakdown.provider';
import { SCENE_BREAKDOWN_PROMPT_VERSION } from './scene-breakdown.prompt';
import { SceneBreakdownValidator } from './scene-breakdown.validator';

@Injectable()
export class SceneBreakdownService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SCENE_BREAKDOWN_PROVIDER)
    private readonly provider: SceneBreakdownProvider,
    private readonly validator: SceneBreakdownValidator,
  ) {}

  async generate(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { ledger: { select: { data: true } } },
    });
    if (!game?.ledger) throw new NotFoundException('Game ledger not found');
    const [outlineRun, validationRun, storyRun] = await Promise.all([
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
        include: { generatedStory: true },
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
      const ledger = game.ledger.data as unknown as GameLedger;
      const breakdown = sceneBreakdownSchema.parse(
        await this.provider.generate({
          ledger,
          outline: storyOutlineSchema.parse(outlineRun.storyOutline.data),
          validatedStoryMarkdown:
            validationRun.storyValidation.repairedStoryMarkdown ||
            storyRun.generatedStory.storyMarkdown,
        }),
      );
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
    const run = await this.prisma.generationRun.findFirst({
      where: { gameId, currentStage: 'SCENE_BREAKDOWN', status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      include: { sceneBreakdown: true },
    });
    if (!run)
      throw new NotFoundException('No completed scene breakdown exists');
    return run;
  }
}
