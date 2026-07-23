import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { GameLedger } from '../chess/models/game-ledger';
import { PrismaService } from '../database/prisma.service';
import {
  narrativeAnalysisSchema,
  type NarrativeAnalysis,
} from '../narrative-analysis/models/narrative-analysis';
import { storyOutlineSchema } from './models/story-outline';
import { STORY_OUTLINE_PROMPT_VERSION } from './story-outline.prompt';
import {
  STORY_OUTLINE_PROVIDER,
  type StoryOutlineProvider,
} from './story-outline.provider';
import { StoryOutlineValidator } from './story-outline.validator';

@Injectable()
export class StoryOutlineService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORY_OUTLINE_PROVIDER)
    private readonly provider: StoryOutlineProvider,
    private readonly validator: StoryOutlineValidator,
  ) {}

  async generate(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, ledger: { select: { data: true } } },
    });
    if (!game?.ledger) {
      throw new NotFoundException(`Game ${gameId} or its ledger was not found`);
    }
    const analysisRun = await this.prisma.generationRun.findFirst({
      where: {
        gameId,
        currentStage: 'NARRATIVE_ANALYSIS',
        status: 'COMPLETED',
      },
      orderBy: { createdAt: 'desc' },
      include: { narrativeAnalysis: true },
    });
    if (!analysisRun?.narrativeAnalysis) {
      throw new NotFoundException(
        `Generate a completed narrative analysis for game ${gameId} first`,
      );
    }

    const run = await this.prisma.generationRun.create({
      data: {
        gameId,
        status: 'RUNNING',
        currentStage: 'OUTLINE',
        model: this.provider.model,
        promptVersion: STORY_OUTLINE_PROMPT_VERSION,
      },
    });

    try {
      const ledger = game.ledger.data as unknown as GameLedger;
      const narrativeAnalysis: NarrativeAnalysis =
        narrativeAnalysisSchema.parse(analysisRun.narrativeAnalysis.data);
      const outline = storyOutlineSchema.parse(
        await this.provider.generate({
          ledger,
          narrativeAnalysis,
          characterRegistry: ledger.pieces,
        }),
      );
      this.validator.validate(outline, ledger, narrativeAnalysis);
      const data = JSON.parse(JSON.stringify(outline)) as Prisma.InputJsonValue;

      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          error: null,
          storyOutline: { create: { schemaVersion: 1, data } },
        },
      });
      return this.prisma.generationRun.findUnique({
        where: { id: run.id },
        include: { storyOutline: true },
      });
    } catch (error) {
      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error:
            error instanceof Error
              ? error.message
              : 'Outline generation failed',
        },
      });
      throw error;
    }
  }

  async findLatest(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true },
    });
    if (!game) {
      throw new NotFoundException(`Game ${gameId} was not found`);
    }
    const run = await this.prisma.generationRun.findFirst({
      where: { gameId, currentStage: 'OUTLINE', status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      include: { storyOutline: true },
    });
    if (!run) {
      throw new NotFoundException(
        `No completed story outline exists for game ${gameId}`,
      );
    }
    return run;
  }
}
