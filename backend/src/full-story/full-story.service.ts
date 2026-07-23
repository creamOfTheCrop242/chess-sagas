import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import { PrismaService } from '../database/prisma.service';
import { narrativeAnalysisSchema } from '../narrative-analysis/models/narrative-analysis';
import { storyOutlineSchema } from '../story-outline/models/story-outline';
import {
  FULL_STORY_PROVIDER,
  type FullStoryProvider,
} from './full-story.provider';
import { FULL_STORY_PROMPT_VERSION } from './full-story.prompt';
import { FullStoryValidator } from './full-story.validator';
import { generatedStorySchema } from './models/generated-story';

@Injectable()
export class FullStoryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FULL_STORY_PROVIDER)
    private readonly provider: FullStoryProvider,
    private readonly validator: FullStoryValidator,
  ) {}

  async generate(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, ledger: { select: { data: true } } },
    });
    if (!game?.ledger) {
      throw new NotFoundException(`Game ${gameId} or its ledger was not found`);
    }
    const [analysisRun, outlineRun] = await Promise.all([
      this.prisma.generationRun.findFirst({
        where: {
          gameId,
          currentStage: 'NARRATIVE_ANALYSIS',
          status: 'COMPLETED',
        },
        orderBy: { createdAt: 'desc' },
        include: { narrativeAnalysis: true },
      }),
      this.prisma.generationRun.findFirst({
        where: { gameId, currentStage: 'OUTLINE', status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        include: { storyOutline: true },
      }),
    ]);
    if (!analysisRun?.narrativeAnalysis) {
      throw new NotFoundException(
        `Generate a completed narrative analysis for game ${gameId} first`,
      );
    }
    if (!outlineRun?.storyOutline) {
      throw new NotFoundException(
        `Generate a completed story outline for game ${gameId} first`,
      );
    }

    const run = await this.prisma.generationRun.create({
      data: {
        gameId,
        status: 'RUNNING',
        currentStage: 'STORY',
        model: this.provider.model,
        promptVersion: FULL_STORY_PROMPT_VERSION,
      },
    });
    try {
      const ledger = game.ledger.data as unknown as GameLedger;
      const narrativeAnalysis = narrativeAnalysisSchema.parse(
        analysisRun.narrativeAnalysis.data,
      );
      const outline = storyOutlineSchema.parse(outlineRun.storyOutline.data);
      const story = generatedStorySchema.parse(
        await this.provider.generate({
          ledger,
          narrativeAnalysis,
          outline,
          characterRegistry: ledger.pieces,
        }),
      );
      this.validator.validate(story, ledger, outline);

      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          error: null,
          generatedStory: {
            create: {
              schemaVersion: 1,
              title: story.title,
              storyMarkdown: story.storyMarkdown,
            },
          },
        },
      });
      return this.prisma.generationRun.findUnique({
        where: { id: run.id },
        include: { generatedStory: true },
      });
    } catch (error) {
      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error:
            error instanceof Error ? error.message : 'Story generation failed',
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
      where: { gameId, currentStage: 'STORY', status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      include: { generatedStory: true },
    });
    if (!run) {
      throw new NotFoundException(
        `No completed full story exists for game ${gameId}`,
      );
    }
    return run;
  }
}
