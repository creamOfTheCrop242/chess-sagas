import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { GenerationPreparationService } from '../generation/generation-preparation.service';
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
    private readonly preparation: GenerationPreparationService,
    @Inject(NARRATIVE_ANALYSIS_PROVIDER)
    private readonly provider: NarrativeAnalysisProvider,
    private readonly validator: NarrativeAnalysisValidator,
  ) {}

  async generate(gameId: string) {
    return this.preparation.runStageOnce(gameId, 'NARRATIVE_ANALYSIS', () =>
      this.generateOnce(gameId),
    );
  }

  private async generateOnce(gameId: string) {
    const prepared = await this.preparation.prepare(gameId);

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
      const {
        ledger,
        requiredWoundEvents,
        battlefieldEnvironment,
        surrenderContext,
      } = prepared;
      const analysis = narrativeAnalysisSchema.parse(
        await this.provider.analyze({
          ledger,
          requiredWoundEvents,
          battlefieldEnvironment,
          surrenderContext,
          telemetry: {
            gameId,
            generationRunId: run.id,
            attempt: 1,
            repairMode: 'none',
          },
        }),
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
        promptVersion: NARRATIVE_ANALYSIS_PROMPT_VERSION,
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
