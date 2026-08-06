import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { FullStoryService } from '../full-story/full-story.service';
import { FULL_STORY_PROMPT_VERSION } from '../full-story/full-story.prompt';
import { NarrativeAnalysisService } from '../narrative-analysis/narrative-analysis.service';
import { NARRATIVE_ANALYSIS_PROMPT_VERSION } from '../narrative-analysis/narrative-analysis.prompt';
import { SceneBreakdownService } from '../scene-breakdown/scene-breakdown.service';
import { SCENE_BREAKDOWN_PROMPT_VERSION } from '../scene-breakdown/scene-breakdown.prompt';
import { StoryOutlineService } from '../story-outline/story-outline.service';
import { STORY_OUTLINE_PROMPT_VERSION } from '../story-outline/story-outline.prompt';
import { StoryValidationService } from '../story-validation/story-validation.service';
import { PushNotificationService } from './push-notification.service';

const LEASE_MS = 90_000;
const HEARTBEAT_MS = 20_000;

export type SagaJobState =
  'idle' | 'queued' | 'running' | 'completed' | 'failed';

export interface SagaGenerationStatus {
  state: SagaJobState;
  currentStage: 'analysis' | 'outline' | 'story' | 'validation' | 'scenes';
  error: string | null;
  stages: {
    analysis: boolean;
    outline: boolean;
    story: boolean;
    validation: boolean;
    scenes: boolean;
  };
}

@Injectable()
export class SagaGenerationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SagaGenerationService.name);
  private readonly workerId = randomUUID();
  private readonly activeJobs = new Set<string>();
  private drainScheduled = false;
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly analysis: NarrativeAnalysisService,
    private readonly outline: StoryOutlineService,
    private readonly story: FullStoryService,
    private readonly validation: StoryValidationService,
    private readonly scenes: SceneBreakdownService,
    private readonly pushNotifications: PushNotificationService,
  ) {
    this.sweepTimer = setInterval(() => this.scheduleDrain(), 30_000);
  }

  onApplicationBootstrap(): void {
    this.scheduleDrain();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepTimer);
  }

  async start(
    gameId: string,
    pushSubscription?: unknown,
  ): Promise<SagaGenerationStatus> {
    await this.assertGame(gameId);
    const stages = await this.stageSnapshot(gameId);
    if (stages.scenes) {
      await this.prisma.sagaGenerationJob.upsert({
        where: { gameId },
        create: {
          gameId,
          status: 'COMPLETED',
          currentStage: 'SCENE_BREAKDOWN',
          completedAt: new Date(),
        },
        update: {
          status: 'COMPLETED',
          currentStage: 'SCENE_BREAKDOWN',
          completedAt: new Date(),
          error: null,
          workerId: null,
          lockedUntil: null,
        },
      });
      return this.status(gameId);
    }

    const existing = await this.prisma.sagaGenerationJob.findUnique({
      where: { gameId },
    });
    const pushSubscriptions = this.pushNotifications.mergeSubscriptions(
      existing?.pushSubscriptions,
      pushSubscription,
    );
    if (!existing || ['FAILED', 'COMPLETED'].includes(existing.status)) {
      await this.prisma.sagaGenerationJob.upsert({
        where: { gameId },
        create: {
          gameId,
          status: 'QUEUED',
          currentStage: this.nextStage(stages),
          pushSubscriptions:
            pushSubscriptions as unknown as Prisma.InputJsonValue,
        },
        update: {
          status: 'QUEUED',
          currentStage: this.nextStage(stages),
          error: null,
          completedAt: null,
          workerId: null,
          lockedUntil: null,
          heartbeatAt: null,
          pushSubscriptions:
            pushSubscriptions as unknown as Prisma.InputJsonValue,
        },
      });
    } else if (pushSubscriptions.length) {
      await this.prisma.sagaGenerationJob.update({
        where: { gameId },
        data: {
          pushSubscriptions:
            pushSubscriptions as unknown as Prisma.InputJsonValue,
        },
      });
    }
    this.scheduleDrain();
    return this.status(gameId);
  }

  async status(gameId: string): Promise<SagaGenerationStatus> {
    await this.assertGame(gameId);
    const [stages, job] = await Promise.all([
      this.stageSnapshot(gameId),
      this.prisma.sagaGenerationJob.findUnique({ where: { gameId } }),
    ]);
    return {
      state: stages.scenes
        ? 'completed'
        : job
          ? (job.status.toLowerCase() as SagaJobState)
          : 'idle',
      currentStage: this.clientStage(
        job?.currentStage ?? this.nextStage(stages),
      ),
      error: job?.error ?? null,
      stages,
    };
  }

  private scheduleDrain(): void {
    if (this.drainScheduled) return;
    this.drainScheduled = true;
    setTimeout(() => {
      this.drainScheduled = false;
      void this.drain().catch((error: unknown) =>
        this.logger.error(
          `Saga queue scan failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        ),
      );
    }, 0);
  }

  private async drain(): Promise<void> {
    const now = new Date();
    const candidates = await this.prisma.sagaGenerationJob.findMany({
      where: {
        OR: [
          { status: 'QUEUED' },
          { status: 'RUNNING', lockedUntil: { lt: now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 1,
    });
    for (const candidate of candidates) {
      if (this.activeJobs.has(candidate.id)) continue;
      const claimed = await this.prisma.sagaGenerationJob.updateMany({
        where: {
          id: candidate.id,
          OR: [
            { status: 'QUEUED' },
            { status: 'RUNNING', lockedUntil: { lt: now } },
          ],
        },
        data: {
          status: 'RUNNING',
          workerId: this.workerId,
          heartbeatAt: now,
          lockedUntil: new Date(now.getTime() + LEASE_MS),
        },
      });
      if (claimed.count !== 1) continue;
      this.activeJobs.add(candidate.id);
      void this.execute(candidate.id, candidate.gameId).finally(() => {
        this.activeJobs.delete(candidate.id);
        this.scheduleDrain();
      });
    }
  }

  private async execute(jobId: string, gameId: string): Promise<void> {
    const heartbeat = setInterval(() => {
      void this.extendLease(jobId);
    }, HEARTBEAT_MS);
    try {
      let stages = await this.stageSnapshot(gameId);
      if (!stages.analysis) {
        await this.setStage(jobId, gameId, 'NARRATIVE_ANALYSIS');
        await this.analysis.generate(gameId);
      }
      stages = await this.stageSnapshot(gameId);
      if (!stages.outline) {
        await this.setStage(jobId, gameId, 'OUTLINE');
        await this.outline.generate(gameId);
      }
      stages = await this.stageSnapshot(gameId);
      if (!stages.story) {
        await this.setStage(jobId, gameId, 'STORY');
        await this.story.generate(gameId);
      }
      stages = await this.stageSnapshot(gameId);
      if (!stages.validation) {
        await this.setStage(jobId, gameId, 'VALIDATION');
        await this.validation.validate(gameId);
      }
      stages = await this.stageSnapshot(gameId);
      if (!stages.scenes) {
        await this.setStage(jobId, gameId, 'SCENE_BREAKDOWN');
        await this.scenes.generate(gameId);
      }
      const completedJob = await this.prisma.sagaGenerationJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          currentStage: 'SCENE_BREAKDOWN',
          completedAt: new Date(),
          error: null,
          workerId: null,
          lockedUntil: null,
        },
        select: { pushSubscriptions: true },
      });
      await this.pushNotifications.sendSagaReady(
        completedJob.pushSubscriptions,
        gameId,
      );
      await this.prisma.sagaGenerationJob.update({
        where: { id: jobId },
        data: { pushSubscriptions: [] },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Saga generation failed';
      this.logger.error(`Saga job failed gameId=${gameId}: ${message}`);
      const failed = await this.prisma.sagaGenerationJob.updateMany({
        where: { id: jobId, workerId: this.workerId },
        data: {
          status: 'FAILED',
          error: message,
          completedAt: new Date(),
          workerId: null,
          lockedUntil: null,
        },
      });
      if (failed.count === 1) {
        const failedJob = await this.prisma.sagaGenerationJob.findUnique({
          where: { id: jobId },
          select: { pushSubscriptions: true },
        });
        await this.pushNotifications.sendSagaFailed(
          failedJob?.pushSubscriptions,
          gameId,
        );
      }
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async setStage(
    jobId: string,
    gameId: string,
    stage:
      | 'NARRATIVE_ANALYSIS'
      | 'OUTLINE'
      | 'STORY'
      | 'VALIDATION'
      | 'SCENE_BREAKDOWN',
  ): Promise<void> {
    const now = new Date();
    const job = await this.prisma.sagaGenerationJob.update({
      where: { id: jobId },
      data: {
        currentStage: stage,
        heartbeatAt: now,
        lockedUntil: new Date(now.getTime() + LEASE_MS),
      },
      select: { pushSubscriptions: true },
    });
    await this.pushNotifications.sendSagaStage(
      job.pushSubscriptions,
      gameId,
      stage,
    );
  }

  private async extendLease(jobId: string): Promise<void> {
    const now = new Date();
    await this.prisma.sagaGenerationJob.updateMany({
      where: { id: jobId, status: 'RUNNING', workerId: this.workerId },
      data: {
        heartbeatAt: now,
        lockedUntil: new Date(now.getTime() + LEASE_MS),
      },
    });
  }

  private async assertGame(gameId: string): Promise<void> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true },
    });
    if (!game) throw new NotFoundException(`Game ${gameId} was not found`);
  }

  private async stageSnapshot(gameId: string) {
    const runs = await this.prisma.generationRun.findMany({
      where: { gameId, status: 'COMPLETED' },
      select: {
        currentStage: true,
        promptVersion: true,
        narrativeAnalysis: { select: { id: true } },
        storyOutline: { select: { id: true } },
        generatedStory: { select: { id: true } },
        storyValidation: { select: { valid: true } },
        sceneBreakdown: { select: { id: true } },
      },
    });
    return {
      analysis: runs.some(
        (run) =>
          run.currentStage === 'NARRATIVE_ANALYSIS' &&
          run.promptVersion === NARRATIVE_ANALYSIS_PROMPT_VERSION &&
          Boolean(run.narrativeAnalysis),
      ),
      outline: runs.some(
        (run) =>
          run.currentStage === 'OUTLINE' &&
          run.promptVersion === STORY_OUTLINE_PROMPT_VERSION &&
          Boolean(run.storyOutline),
      ),
      story: runs.some(
        (run) =>
          run.currentStage === 'STORY' &&
          run.promptVersion === FULL_STORY_PROMPT_VERSION &&
          Boolean(run.generatedStory),
      ),
      validation: runs.some((run) => Boolean(run.storyValidation?.valid)),
      scenes: runs.some(
        (run) =>
          Boolean(run.sceneBreakdown) &&
          ((run.currentStage === 'STORY' &&
            run.promptVersion === FULL_STORY_PROMPT_VERSION) ||
            (run.currentStage === 'SCENE_BREAKDOWN' &&
              run.promptVersion === SCENE_BREAKDOWN_PROMPT_VERSION)),
      ),
    };
  }

  private nextStage(stages: SagaGenerationStatus['stages']) {
    if (!stages.analysis) return 'NARRATIVE_ANALYSIS' as const;
    if (!stages.outline) return 'OUTLINE' as const;
    if (!stages.story) return 'STORY' as const;
    if (!stages.validation) return 'VALIDATION' as const;
    return 'SCENE_BREAKDOWN' as const;
  }

  private clientStage(stage: string): SagaGenerationStatus['currentStage'] {
    if (stage === 'NARRATIVE_ANALYSIS' || stage === 'LEDGER') return 'analysis';
    if (stage === 'OUTLINE') return 'outline';
    if (stage === 'STORY' || stage === 'REPAIR') return 'story';
    if (stage === 'VALIDATION') return 'validation';
    return 'scenes';
  }
}
