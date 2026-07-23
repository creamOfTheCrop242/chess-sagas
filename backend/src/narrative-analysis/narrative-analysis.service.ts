import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { GameLedger } from '../chess/models/game-ledger';
import { PrismaService } from '../database/prisma.service';
import {
  NARRATIVE_ANALYSIS_PROVIDER,
  type NarrativeAnalysisProvider,
} from './llm-provider';
import { narrativeAnalysisSchema } from './models/narrative-analysis';
import { NARRATIVE_ANALYSIS_PROMPT_VERSION } from './narrative-analysis.prompt';
import { NarrativeAnalysisValidator } from './narrative-analysis.validator';

@Injectable()
export class NarrativeAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NARRATIVE_ANALYSIS_PROVIDER)
    private readonly provider: NarrativeAnalysisProvider,
    private readonly validator: NarrativeAnalysisValidator,
  ) {}

  async generate(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, ledger: { select: { data: true } } },
    });
    if (!game?.ledger) {
      throw new NotFoundException(`Game ${gameId} or its ledger was not found`);
    }

    const run = await this.prisma.generationRun.create({
      data: {
        gameId,
        status: 'RUNNING',
        currentStage: 'NARRATIVE_ANALYSIS',
        model: this.provider.model,
        promptVersion: NARRATIVE_ANALYSIS_PROMPT_VERSION,
      },
    });

    try {
      const ledger = game.ledger.data as unknown as GameLedger;
      const analysis = narrativeAnalysisSchema.parse(
        await this.provider.analyze({ ledger }),
      );
      this.validator.validate(analysis, ledger);
      const data = JSON.parse(
        JSON.stringify(analysis),
      ) as Prisma.InputJsonValue;

      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          error: null,
          narrativeAnalysis: {
            create: {
              schemaVersion: 1,
              data,
            },
          },
        },
      });

      return this.prisma.generationRun.findUnique({
        where: { id: run.id },
        include: { narrativeAnalysis: true },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Analysis generation failed';
      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          error: message,
          completedAt: new Date(),
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
      where: {
        gameId,
        currentStage: 'NARRATIVE_ANALYSIS',
        status: 'COMPLETED',
      },
      orderBy: { createdAt: 'desc' },
      include: { narrativeAnalysis: true },
    });
    if (!run) {
      throw new NotFoundException(
        `No completed narrative analysis exists for game ${gameId}`,
      );
    }
    return run;
  }
}
