import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { GenerationBillingState, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.service';
import { CreditService } from '../billing/credit.service';
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
const RATE_WINDOW_MS = 60 * 60_000;

export type SagaJobState =
  'idle' | 'queued' | 'running' | 'completed' | 'failed';

export interface SagaGenerationStatus {
  state: SagaJobState;
  startedAt: string | null;
  completedAt: string | null;
  currentStage: 'analysis' | 'outline' | 'story' | 'validation' | 'scenes';
  error: string | null;
  stages: {
    analysis: boolean;
    outline: boolean;
    story: boolean;
    validation: boolean;
    scenes: boolean;
  };
  billing: {
    enforcementEnabled: boolean;
    state: GenerationBillingState;
    reused: boolean;
  };
}

export interface ActiveSagaGeneration {
  gameId: string;
  status: SagaGenerationStatus;
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
    private readonly credits: CreditService,
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
    user: AuthenticatedUser | null = null,
    requestIp: string | null = null,
  ): Promise<SagaGenerationStatus> {
    await this.assertGame(gameId);
    const stages = await this.stageSnapshot(gameId);
    if (stages.scenes) {
      const existingCompleted = await this.prisma.sagaGenerationJob.findUnique({
        where: { gameId },
      });
      if (existingCompleted?.billingState === GenerationBillingState.RESERVED) {
        await this.persistSagaForJob(existingCompleted.id, gameId);
        const consumed = await this.consumeReservedCredit(existingCompleted.id);
        await this.prisma.sagaGenerationJob.update({
          where: { id: existingCompleted.id },
          data: {
            status: 'COMPLETED',
            currentStage: 'SCENE_BREAKDOWN',
            completedAt: new Date(),
            error: null,
            workerId: null,
            lockedUntil: null,
            ...(consumed ? { billingState: consumed } : {}),
          },
        });
        return this.status(gameId);
      }
      await this.prisma.sagaGenerationJob.upsert({
        where: { gameId },
        create: {
          gameId,
          createdAt: new Date(),
          status: 'COMPLETED',
          currentStage: 'SCENE_BREAKDOWN',
          completedAt: new Date(),
          requestedByUserId: user?.id,
          billingState: GenerationBillingState.REUSED,
        },
        update: {
          createdAt: new Date(),
          status: 'COMPLETED',
          currentStage: 'SCENE_BREAKDOWN',
          completedAt: new Date(),
          error: null,
          workerId: null,
          lockedUntil: null,
          ...(existingCompleted?.billingState ===
            GenerationBillingState.UNTRACKED && {
            billingState: GenerationBillingState.REUSED,
          }),
        },
      });
      await this.persistSaga(gameId, user?.id ?? null);
      const status = await this.status(gameId);
      return { ...status, billing: { ...status.billing, reused: true } };
    }

    if (this.credits.enforcementEnabled && !user) {
      throw new UnauthorizedException('Sign in to generate a new saga');
    }

    const existing = await this.prisma.sagaGenerationJob.findUnique({
      where: { gameId },
    });
    const pushSubscriptions = this.pushNotifications.mergeSubscriptions(
      existing?.pushSubscriptions,
      pushSubscription,
    );
    if (existing && ['QUEUED', 'RUNNING'].includes(existing.status)) {
      if (pushSubscriptions.length) {
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

    this.assertGenerationEnabled();
    const requestIpHash = this.requestIpHash(requestIp);
    await this.assertGenerationLimits(user, requestIpHash, existing?.id);

    if (!existing || ['FAILED', 'COMPLETED'].includes(existing.status)) {
      const shadowState = await this.shadowBillingState(user);
      const pendingAuthorization = this.credits.enforcementEnabled;
      const claimState = pendingAuthorization
        ? GenerationBillingState.AUTHORIZING
        : shadowState;
      const claimData = {
        createdAt: new Date(),
        status: pendingAuthorization
          ? ('FAILED' as const)
          : ('QUEUED' as const),
        currentStage: this.nextStage(stages),
        error: pendingAuthorization ? 'Awaiting credit authorization' : null,
        completedAt: null,
        workerId: null,
        lockedUntil: null,
        heartbeatAt: null,
        requestedByUserId: user?.id,
        requestIpHash,
        billingState: claimState,
        pushSubscriptions:
          pushSubscriptions as unknown as Prisma.InputJsonValue,
      };
      let job: { id: string } | null = null;
      if (!existing) {
        try {
          job = await this.prisma.sagaGenerationJob.create({
            data: { gameId, ...claimData },
            select: { id: true },
          });
        } catch (caught) {
          if (!this.isUniqueConstraintError(caught)) throw caught;
          const sameGameJob = await this.prisma.sagaGenerationJob.findUnique({
            where: { gameId },
            select: { id: true },
          });
          if (!sameGameJob) {
            throw new ConflictException(
              'Another saga is already being generated for this account.',
            );
          }
        }
      } else if (existing.billingState !== GenerationBillingState.AUTHORIZING) {
        let claimed: { count: number };
        try {
          claimed = await this.prisma.sagaGenerationJob.updateMany({
            where: {
              id: existing.id,
              status: existing.status,
              billingState: existing.billingState,
            },
            data: claimData,
          });
        } catch (caught) {
          if (!this.isUniqueConstraintError(caught)) throw caught;
          throw new ConflictException(
            'Another saga is already being generated for this account.',
          );
        }
        if (claimed.count === 1) job = { id: existing.id };
      }
      if (pendingAuthorization && user) {
        if (job) {
          try {
            const reservation = await this.credits.reserve(user.id, job.id);
            await this.prisma.sagaGenerationJob.update({
              where: { id: job.id },
              data: {
                status: 'QUEUED',
                error: null,
                billingState: reservation.bypassed
                  ? GenerationBillingState.UNLIMITED
                  : GenerationBillingState.RESERVED,
              },
            });
          } catch (caught) {
            await this.prisma.sagaGenerationJob.updateMany({
              where: {
                id: job.id,
                billingState: GenerationBillingState.AUTHORIZING,
              },
              data: {
                status: 'FAILED',
                error:
                  caught instanceof Error
                    ? caught.message
                    : 'Credit authorization failed',
                billingState: GenerationBillingState.UNTRACKED,
              },
            });
            throw caught;
          }
        }
      }
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

  private assertGenerationEnabled(): void {
    const configured =
      process.env.SAGA_GENERATION_ENABLED?.trim().toLowerCase();
    if (configured === 'false' || configured === '0') {
      throw new ServiceUnavailableException(
        'Saga generation is temporarily unavailable. Existing sagas remain available.',
      );
    }
  }

  private async assertGenerationLimits(
    user: AuthenticatedUser | null,
    requestIpHash: string | null,
    retryJobId?: string,
  ): Promise<void> {
    const since = new Date(Date.now() - RATE_WINDOW_MS);
    if (user) {
      const active = await this.prisma.sagaGenerationJob.findFirst({
        where: {
          requestedByUserId: user.id,
          status: { in: ['QUEUED', 'RUNNING'] },
          ...(retryJobId ? { id: { not: retryJobId } } : {}),
        },
        select: { id: true },
      });
      if (active) {
        throw new ConflictException(
          'Another saga is already being generated for this account.',
        );
      }
      const accountStarts = await this.prisma.sagaGenerationJob.count({
        where: {
          requestedByUserId: user.id,
          createdAt: { gte: since },
          ...(retryJobId ? { id: { not: retryJobId } } : {}),
        },
      });
      if (
        accountStarts >=
        this.positiveIntegerEnvironmentValue(
          'SAGA_GENERATION_ACCOUNT_HOURLY_LIMIT',
          5,
        )
      ) {
        throw new HttpException(
          'This account has reached its hourly saga-generation limit. Try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    if (requestIpHash) {
      const ipStarts = await this.prisma.sagaGenerationJob.count({
        where: {
          requestIpHash,
          createdAt: { gte: since },
          ...(retryJobId ? { id: { not: retryJobId } } : {}),
        },
      });
      if (
        ipStarts >=
        this.positiveIntegerEnvironmentValue(
          'SAGA_GENERATION_IP_HOURLY_LIMIT',
          20,
        )
      ) {
        throw new HttpException(
          'Too many sagas have been started from this network. Try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  private requestIpHash(requestIp: string | null): string | null {
    if (!requestIp) return null;
    return createHash('sha256')
      .update(`chess-sagas:generation:${requestIp}`)
      .digest('hex');
  }

  private positiveIntegerEnvironmentValue(
    name: string,
    fallback: number,
  ): number {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
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
      startedAt: job?.createdAt?.toISOString() ?? null,
      completedAt: job?.completedAt?.toISOString() ?? null,
      currentStage: this.clientStage(
        job?.currentStage ?? this.nextStage(stages),
      ),
      error: job?.error ?? null,
      stages,
      billing: {
        enforcementEnabled: this.credits.enforcementEnabled,
        state: job?.billingState ?? GenerationBillingState.UNTRACKED,
        reused: false,
      },
    };
  }

  async activeForUser(
    user: AuthenticatedUser | null,
  ): Promise<ActiveSagaGeneration | null> {
    if (!user) return null;
    const job = await this.prisma.sagaGenerationJob.findFirst({
      where: {
        requestedByUserId: user.id,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: { gameId: true },
    });
    if (!job) return null;
    return { gameId: job.gameId, status: await this.status(job.gameId) };
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
      await this.persistSagaForJob(jobId, gameId);
      const billingState = await this.consumeReservedCredit(jobId);
      const completedJob = await this.prisma.sagaGenerationJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          currentStage: 'SCENE_BREAKDOWN',
          completedAt: new Date(),
          error: null,
          workerId: null,
          lockedUntil: null,
          ...(billingState ? { billingState } : {}),
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
        await this.releaseReservedCredit(jobId);
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

  private async shadowBillingState(
    user: AuthenticatedUser | null,
  ): Promise<GenerationBillingState> {
    if (!user) return GenerationBillingState.SHADOW_ANONYMOUS;
    const state = await this.credits.state(user.id);
    if (state.unlimited) return GenerationBillingState.SHADOW_UNLIMITED;
    return (state.available ?? 0) >= 1
      ? GenerationBillingState.SHADOW_AVAILABLE
      : GenerationBillingState.SHADOW_INSUFFICIENT;
  }

  private isUniqueConstraintError(caught: unknown): boolean {
    return (
      typeof caught === 'object' &&
      caught !== null &&
      'code' in caught &&
      caught.code === 'P2002'
    );
  }

  private async consumeReservedCredit(
    jobId: string,
  ): Promise<GenerationBillingState | null> {
    const job = await this.prisma.sagaGenerationJob.findUnique({
      where: { id: jobId },
      select: { billingState: true },
    });
    if (job?.billingState !== GenerationBillingState.RESERVED) return null;
    const consumed = await this.credits.consumeForJob(jobId);
    if (!consumed) {
      throw new Error(
        `Credit reservation for generation job ${jobId} is missing`,
      );
    }
    return GenerationBillingState.CONSUMED;
  }

  private async releaseReservedCredit(jobId: string): Promise<void> {
    const job = await this.prisma.sagaGenerationJob.findUnique({
      where: { id: jobId },
      select: { billingState: true },
    });
    if (job?.billingState !== GenerationBillingState.RESERVED) return;
    try {
      const released = await this.credits.releaseForJob(jobId);
      if (!released) {
        this.logger.error(
          `Credit reservation for failed generation job ${jobId} is missing`,
        );
        return;
      }
      await this.prisma.sagaGenerationJob.update({
        where: { id: jobId },
        data: { billingState: GenerationBillingState.RELEASED },
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      this.logger.error(
        `Credit release failed generationJobId=${jobId}: ${message}`,
      );
    }
  }

  private async persistSagaForJob(
    jobId: string,
    gameId: string,
  ): Promise<void> {
    const job = await this.prisma.sagaGenerationJob.findUnique({
      where: { id: jobId },
      select: { requestedByUserId: true },
    });
    await this.persistSaga(gameId, job?.requestedByUserId ?? null);
  }

  private async persistSaga(
    gameId: string,
    creatorId: string | null,
  ): Promise<void> {
    const run = await this.prisma.generationRun.findFirst({
      where: {
        gameId,
        status: 'COMPLETED',
        sceneBreakdown: { isNot: null },
      },
      orderBy: { completedAt: 'desc' },
      select: { id: true },
    });
    if (!run) return;
    const existing = await this.prisma.saga.findUnique({
      where: { generationRunId: run.id },
      select: { id: true, creatorId: true },
    });
    if (existing) {
      if (!existing.creatorId && creatorId) {
        await this.prisma.saga.updateMany({
          where: { id: existing.id, creatorId: null },
          data: { creatorId },
        });
      }
      return;
    }
    await this.prisma.saga.create({
      data: {
        gameId,
        generationRunId: run.id,
        creatorId,
        visibility: 'PUBLIC',
        storyVersion: FULL_STORY_PROMPT_VERSION,
      },
    });
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
