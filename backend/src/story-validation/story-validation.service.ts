import {
  BadGatewayException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { GameLedger } from '../chess/models/game-ledger';
import { PrismaService } from '../database/prisma.service';
import { narrativeAnalysisSchema } from '../narrative-analysis/models/narrative-analysis';
import { storyOutlineSchema } from '../story-outline/models/story-outline';
import { DeterministicStoryValidator } from './deterministic-story.validator';
import { storyValidationResultSchema } from './models/story-validation';
import {
  STORY_VALIDATION_PROVIDER,
  type StoryValidationProvider,
} from './story-validation.provider';
import { STORY_VALIDATION_PROMPT_VERSION } from './story-validation.prompt';

@Injectable()
export class StoryValidationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORY_VALIDATION_PROVIDER)
    private readonly provider: StoryValidationProvider,
    private readonly deterministic: DeterministicStoryValidator,
  ) {}

  async validate(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { ledger: { select: { data: true } } },
    });
    if (!game?.ledger) {
      throw new NotFoundException(`Game ${gameId} or its ledger was not found`);
    }
    const [analysisRun, outlineRun, storyRun] = await Promise.all([
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
      this.prisma.generationRun.findFirst({
        where: { gameId, currentStage: 'STORY', status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        include: { generatedStory: true },
      }),
    ]);
    if (!analysisRun?.narrativeAnalysis)
      throw new NotFoundException('A completed narrative analysis is required');
    if (!outlineRun?.storyOutline)
      throw new NotFoundException('A completed story outline is required');
    if (!storyRun?.generatedStory)
      throw new NotFoundException('A completed full story is required');

    const run = await this.prisma.generationRun.create({
      data: {
        gameId,
        status: 'RUNNING',
        currentStage: 'VALIDATION',
        model: this.provider.model,
        promptVersion: STORY_VALIDATION_PROMPT_VERSION,
      },
    });
    try {
      const ledger = game.ledger.data as unknown as GameLedger;
      const deterministicFindings = this.deterministic.validate(
        storyRun.generatedStory.storyMarkdown,
        ledger,
      );
      const result = storyValidationResultSchema.parse(
        await this.provider.validate({
          ledger,
          narrativeAnalysis: narrativeAnalysisSchema.parse(
            analysisRun.narrativeAnalysis.data,
          ),
          outline: storyOutlineSchema.parse(outlineRun.storyOutline.data),
          title: storyRun.generatedStory.title,
          storyMarkdown: storyRun.generatedStory.storyMarkdown,
          deterministicFindings,
        }),
      );
      const findings = [
        ...deterministicFindings,
        ...result.findings.filter(
          (finding) =>
            !deterministicFindings.some(
              (existing) =>
                existing.type === finding.type &&
                existing.excerpt === finding.excerpt,
            ),
        ),
      ];
      const hasErrors = findings.some(
        (finding) => finding.severity === 'error',
      );
      const repairApplied = Boolean(result.repairedStoryMarkdown);
      if (hasErrors && !result.repairedStoryMarkdown) {
        throw new BadGatewayException(
          'Validation found errors but OpenAI returned no repaired story',
        );
      }
      const repairedStoryMarkdown = result.repairedStoryMarkdown
        ? this.deterministic.repairProhibitedTerminology(
            result.repairedStoryMarkdown,
          )
        : null;
      if (repairedStoryMarkdown) {
        const remainingFindings = this.deterministic.validate(
          repairedStoryMarkdown,
          ledger,
        );
        if (remainingFindings.length > 0) {
          throw new BadGatewayException(
            `Repaired story still has deterministic errors: ${remainingFindings
              .map((finding) => finding.message)
              .join('; ')}`,
          );
        }
      }
      const valid = !hasErrors || repairApplied;
      const findingsJson = JSON.parse(
        JSON.stringify(findings),
      ) as Prisma.InputJsonValue;

      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          error: null,
          storyValidation: {
            create: {
              sourceStoryId: storyRun.generatedStory.id,
              schemaVersion: 1,
              valid,
              findings: findingsJson,
              repairedStoryMarkdown,
            },
          },
        },
      });
      return this.prisma.generationRun.findUnique({
        where: { id: run.id },
        include: { storyValidation: true },
      });
    } catch (error) {
      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error:
            error instanceof Error ? error.message : 'Story validation failed',
        },
      });
      throw error;
    }
  }

  async findLatest(gameId: string) {
    const run = await this.prisma.generationRun.findFirst({
      where: {
        gameId,
        currentStage: 'VALIDATION',
        status: 'COMPLETED',
      },
      orderBy: { createdAt: 'desc' },
      include: { storyValidation: true },
    });
    if (!run) {
      throw new NotFoundException(
        `No completed validation exists for game ${gameId}`,
      );
    }
    return run;
  }
}
