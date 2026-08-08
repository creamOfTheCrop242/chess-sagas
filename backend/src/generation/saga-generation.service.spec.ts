import { GenerationBillingState } from '@prisma/client';
import type { CreditService } from '../billing/credit.service';
import type { PrismaService } from '../database/prisma.service';
import type { FullStoryService } from '../full-story/full-story.service';
import { FULL_STORY_PROMPT_VERSION } from '../full-story/full-story.prompt';
import type { NarrativeAnalysisService } from '../narrative-analysis/narrative-analysis.service';
import { NARRATIVE_ANALYSIS_PROMPT_VERSION } from '../narrative-analysis/narrative-analysis.prompt';
import type { SceneBreakdownService } from '../scene-breakdown/scene-breakdown.service';
import type { StoryOutlineService } from '../story-outline/story-outline.service';
import { STORY_OUTLINE_PROMPT_VERSION } from '../story-outline/story-outline.prompt';
import type { StoryValidationService } from '../story-validation/story-validation.service';
import { SagaGenerationService } from './saga-generation.service';
import type { PushNotificationService } from './push-notification.service';

describe('SagaGenerationService', () => {
  const runs: Array<Record<string, unknown>> = [];
  const jobUpdate = jest.fn();
  const jobUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    game: {
      findUnique: jest.fn().mockResolvedValue({ id: 'game-1' }),
    },
    generationRun: {
      findMany: jest.fn().mockImplementation(() => Promise.resolve(runs)),
      findFirst: jest.fn().mockResolvedValue({ id: 'scene-run-1' }),
    },
    saga: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'saga-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    sagaGenerationJob: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'job-1' }),
      update: jobUpdate.mockResolvedValue({}),
      updateMany: jobUpdateMany,
      upsert: jest.fn().mockResolvedValue({ id: 'job-1' }),
    },
  } as unknown as PrismaService;
  const analysis = {
    generate: jest.fn(),
  } as unknown as NarrativeAnalysisService;
  const outline = { generate: jest.fn() } as unknown as StoryOutlineService;
  const story = { generate: jest.fn() } as unknown as FullStoryService;
  const validation = {
    validate: jest.fn(),
  } as unknown as StoryValidationService;
  const scenes = { generate: jest.fn() } as unknown as SceneBreakdownService;
  const pushNotifications = {
    mergeSubscriptions: jest.fn().mockReturnValue([]),
    sendSagaStage: jest.fn().mockResolvedValue(undefined),
    sendSagaReady: jest.fn().mockResolvedValue(undefined),
    sendSagaFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as PushNotificationService;
  let enforcementEnabled = false;
  const credits = {
    get enforcementEnabled() {
      return enforcementEnabled;
    },
    state: jest.fn().mockResolvedValue({
      enforcementEnabled: false,
      unlimited: false,
      balance: 1,
      reserved: 0,
      available: 1,
    }),
    reserve: jest.fn(),
    consumeForJob: jest.fn().mockResolvedValue(true),
    releaseForJob: jest.fn().mockResolvedValue(true),
  } as unknown as CreditService;
  let service: SagaGenerationService;

  beforeEach(() => {
    jest.clearAllMocks();
    enforcementEnabled = false;
    runs.length = 0;
    jest.mocked(prisma.sagaGenerationJob.findUnique).mockResolvedValue(null);
    jest.mocked(prisma.generationRun.findFirst).mockResolvedValue({
      id: 'scene-run-1',
    } as never);
    jest.mocked(prisma.saga.findUnique).mockResolvedValue(null);
    jest.mocked(prisma.sagaGenerationJob.upsert).mockResolvedValue({
      id: 'job-1',
    } as never);
    jest.mocked(prisma.sagaGenerationJob.create).mockResolvedValue({
      id: 'job-1',
    } as never);
    jest.mocked(credits.state).mockResolvedValue({
      enforcementEnabled: false,
      unlimited: false,
      balance: 1,
      reserved: 0,
      available: 1,
    });
    jest.mocked(credits.consumeForJob).mockResolvedValue(true);
    jest.mocked(credits.releaseForJob).mockResolvedValue(true);
    service = new SagaGenerationService(
      prisma,
      analysis,
      outline,
      story,
      validation,
      scenes,
      pushNotifications,
      credits,
    );
  });

  afterEach(() => service.onModuleDestroy());

  it('reports completed artifacts even when they predate the job queue', async () => {
    runs.push(...completedRuns());

    await expect(service.status('game-1')).resolves.toEqual({
      state: 'completed',
      currentStage: 'scenes',
      error: null,
      stages: {
        analysis: true,
        outline: true,
        story: true,
        validation: true,
        scenes: true,
      },
      billing: {
        enforcementEnabled: false,
        state: GenerationBillingState.UNTRACKED,
        reused: false,
      },
    });
  });

  it('runs missing stages in order and reuses scenes persisted with the story', async () => {
    jest.mocked(analysis.generate).mockImplementation(async () => {
      runs.push({
        currentStage: 'NARRATIVE_ANALYSIS',
        promptVersion: NARRATIVE_ANALYSIS_PROMPT_VERSION,
        narrativeAnalysis: { id: 'analysis-1' },
      });
      return {} as never;
    });
    jest.mocked(outline.generate).mockImplementation(async () => {
      runs.push({
        currentStage: 'OUTLINE',
        promptVersion: STORY_OUTLINE_PROMPT_VERSION,
        storyOutline: { id: 'outline-1' },
      });
      return {} as never;
    });
    jest.mocked(story.generate).mockImplementation(async () => {
      runs.push(
        {
          currentStage: 'STORY',
          promptVersion: FULL_STORY_PROMPT_VERSION,
          generatedStory: { id: 'story-1' },
          sceneBreakdown: { id: 'scenes-1' },
        },
        {
          currentStage: 'VALIDATION',
          promptVersion: 'local-package-v1',
          storyValidation: { valid: true },
        },
      );
      return {} as never;
    });

    await (
      service as unknown as {
        execute(jobId: string, gameId: string): Promise<void>;
      }
    ).execute('job-1', 'game-1');

    expect(analysis.generate).toHaveBeenCalledWith('game-1');
    expect(outline.generate).toHaveBeenCalledWith('game-1');
    expect(story.generate).toHaveBeenCalledWith('game-1');
    expect(pushNotifications.sendSagaStage).toHaveBeenNthCalledWith(
      1,
      undefined,
      'game-1',
      'NARRATIVE_ANALYSIS',
    );
    expect(pushNotifications.sendSagaStage).toHaveBeenNthCalledWith(
      2,
      undefined,
      'game-1',
      'OUTLINE',
    );
    expect(pushNotifications.sendSagaStage).toHaveBeenNthCalledWith(
      3,
      undefined,
      'game-1',
      'STORY',
    );
    expect(validation.validate).not.toHaveBeenCalled();
    expect(scenes.generate).not.toHaveBeenCalled();
    expect(jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
    expect(pushNotifications.sendSagaReady).toHaveBeenCalledWith(
      undefined,
      'game-1',
    );
  });

  it('notifies the user when generation exhausts its automatic retries', async () => {
    const subscriptions = [
      {
        endpoint: 'https://push.example/device',
        keys: { p256dh: 'public-key', auth: 'auth-key' },
      },
    ];
    jest.mocked(analysis.generate).mockRejectedValueOnce(new Error('failed'));
    jest
      .mocked(prisma.sagaGenerationJob.findUnique)
      .mockResolvedValueOnce({ billingState: 'UNTRACKED' } as never)
      .mockResolvedValueOnce({ pushSubscriptions: subscriptions } as never);

    await (
      service as unknown as {
        execute(jobId: string, gameId: string): Promise<void>;
      }
    ).execute('job-1', 'game-1');

    expect(jobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(pushNotifications.sendSagaFailed).toHaveBeenCalledWith(
      subscriptions,
      'game-1',
    );
  });

  it('records an available shadow decision without reserving credit', async () => {
    jest.mocked(prisma.sagaGenerationJob.findUnique).mockResolvedValue(null);

    const result = await service.start('game-1', undefined, {
      id: 'user-1',
      email: 'reader@example.com',
      displayName: 'Reader',
      avatarUrl: null,
    });

    expect(credits.state).toHaveBeenCalledWith('user-1');
    expect(credits.reserve).not.toHaveBeenCalled();
    expect(prisma.sagaGenerationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestedByUserId: 'user-1',
          billingState: GenerationBillingState.SHADOW_AVAILABLE,
          status: 'QUEUED',
        }),
      }),
    );
    expect(result.billing.enforcementEnabled).toBe(false);
  });

  it.each([
    [null, GenerationBillingState.SHADOW_ANONYMOUS],
    [
      {
        id: 'user-1',
        email: 'reader@example.com',
        displayName: 'Reader',
        avatarUrl: null,
      },
      GenerationBillingState.SHADOW_INSUFFICIENT,
    ],
  ])(
    'records shadow eligibility without blocking generation',
    async (user, state) => {
      jest.mocked(credits.state).mockResolvedValue({
        enforcementEnabled: false,
        unlimited: false,
        balance: 0,
        reserved: 0,
        available: 0,
      });

      await service.start('game-1', undefined, user);

      expect(prisma.sagaGenerationJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            billingState: state,
            status: 'QUEUED',
          }),
        }),
      );
      expect(credits.reserve).not.toHaveBeenCalled();
    },
  );

  it('reuses completed scene data without reserving or consuming credit', async () => {
    runs.push(...completedRuns());
    jest.mocked(prisma.sagaGenerationJob.findUnique).mockResolvedValue(null);

    const result = await service.start('game-1', undefined, {
      id: 'user-1',
      email: 'reader@example.com',
      displayName: 'Reader',
      avatarUrl: null,
    });

    expect(result.billing.reused).toBe(true);
    expect(credits.reserve).not.toHaveBeenCalled();
    expect(credits.consumeForJob).not.toHaveBeenCalled();
    expect(prisma.saga.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        gameId: 'game-1',
        generationRunId: 'scene-run-1',
        creatorId: 'user-1',
      }),
    });
  });

  it('claims an existing unowned saga for its authenticated requester', async () => {
    runs.push(...completedRuns());
    jest.mocked(prisma.sagaGenerationJob.findUnique).mockResolvedValue(null);
    jest.mocked(prisma.saga.findUnique).mockResolvedValue({
      id: 'saga-1',
      creatorId: null,
    } as never);

    await service.start('game-1', undefined, {
      id: 'user-1',
      email: 'reader@example.com',
      displayName: 'Reader',
      avatarUrl: null,
    });

    expect(prisma.saga.updateMany).toHaveBeenCalledWith({
      where: { id: 'saga-1', creatorId: null },
      data: { creatorId: 'user-1' },
    });
    expect(prisma.saga.create).not.toHaveBeenCalled();
  });

  it('finishes consuming an existing reservation before treating scenes as reused', async () => {
    runs.push(...completedRuns());
    jest
      .mocked(prisma.sagaGenerationJob.findUnique)
      .mockResolvedValueOnce({
        id: 'job-1',
        billingState: GenerationBillingState.RESERVED,
      } as never)
      .mockResolvedValueOnce({ requestedByUserId: 'user-1' } as never)
      .mockResolvedValueOnce({
        billingState: GenerationBillingState.RESERVED,
      } as never)
      .mockResolvedValueOnce({
        status: 'COMPLETED',
        currentStage: 'SCENE_BREAKDOWN',
        error: null,
        billingState: GenerationBillingState.CONSUMED,
      } as never);

    const result = await service.start('game-1');

    expect(credits.consumeForJob).toHaveBeenCalledWith('job-1');
    expect(jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          billingState: GenerationBillingState.CONSUMED,
        }),
      }),
    );
    expect(result.billing.reused).toBe(false);
  });

  it('requires authentication before reserving when enforcement is enabled', async () => {
    enforcementEnabled = true;

    await expect(service.start('game-1')).rejects.toThrow(
      'Sign in to generate a new saga',
    );
    expect(prisma.sagaGenerationJob.create).not.toHaveBeenCalled();
  });

  it('reserves before queueing when enforcement is enabled', async () => {
    enforcementEnabled = true;
    jest.mocked(credits.reserve).mockResolvedValue({
      bypassed: false,
      reason: null,
      reservation: {
        id: 'reservation-1',
        userId: 'user-1',
        sagaGenerationJobId: 'job-1',
        amount: 1,
        status: 'ACTIVE',
      },
    });
    jest.mocked(prisma.sagaGenerationJob.findUnique).mockResolvedValue(null);

    await service.start('game-1', undefined, {
      id: 'user-1',
      email: 'reader@example.com',
      displayName: 'Reader',
      avatarUrl: null,
    });

    expect(credits.reserve).toHaveBeenCalledWith('user-1', 'job-1');
    expect(jobUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        status: 'QUEUED',
        error: null,
        billingState: GenerationBillingState.RESERVED,
      },
    });
  });

  it('does not reserve when another request wins the job creation race', async () => {
    enforcementEnabled = true;
    jest.mocked(prisma.sagaGenerationJob.create).mockRejectedValueOnce({
      code: 'P2002',
    });
    jest
      .mocked(prisma.sagaGenerationJob.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        status: 'FAILED',
        currentStage: 'NARRATIVE_ANALYSIS',
        error: 'Awaiting credit authorization',
        billingState: GenerationBillingState.AUTHORIZING,
      } as never);

    await service.start('game-1', undefined, {
      id: 'user-2',
      email: 'second@example.com',
      displayName: 'Second',
      avatarUrl: null,
    });

    expect(credits.reserve).not.toHaveBeenCalled();
  });

  it('consumes a reserved credit after saga persistence succeeds', async () => {
    jest
      .mocked(prisma.sagaGenerationJob.findUnique)
      .mockResolvedValueOnce({ requestedByUserId: 'user-1' } as never)
      .mockResolvedValueOnce({ billingState: 'RESERVED' } as never);

    await (
      service as unknown as {
        execute(jobId: string, gameId: string): Promise<void>;
      }
    ).execute('job-1', 'game-1');

    expect(prisma.saga.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ creatorId: 'user-1' }),
    });
    expect(credits.consumeForJob).toHaveBeenCalledWith('job-1');
    expect(jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          billingState: GenerationBillingState.CONSUMED,
        }),
      }),
    );
  });

  it('releases a reservation after terminal generation failure', async () => {
    jest.mocked(analysis.generate).mockRejectedValueOnce(new Error('failed'));
    jest
      .mocked(prisma.sagaGenerationJob.findUnique)
      .mockResolvedValueOnce({ billingState: 'RESERVED' } as never)
      .mockResolvedValueOnce({ pushSubscriptions: [] } as never);

    await (
      service as unknown as {
        execute(jobId: string, gameId: string): Promise<void>;
      }
    ).execute('job-1', 'game-1');

    expect(credits.releaseForJob).toHaveBeenCalledWith('job-1');
    expect(jobUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { billingState: GenerationBillingState.RELEASED },
    });
  });
});

function completedRuns(): Array<Record<string, unknown>> {
  return [
    {
      currentStage: 'NARRATIVE_ANALYSIS',
      promptVersion: NARRATIVE_ANALYSIS_PROMPT_VERSION,
      narrativeAnalysis: { id: 'analysis-1' },
    },
    {
      currentStage: 'OUTLINE',
      promptVersion: STORY_OUTLINE_PROMPT_VERSION,
      storyOutline: { id: 'outline-1' },
    },
    {
      currentStage: 'STORY',
      promptVersion: FULL_STORY_PROMPT_VERSION,
      generatedStory: { id: 'story-1' },
      sceneBreakdown: { id: 'scenes-1' },
    },
    {
      currentStage: 'VALIDATION',
      promptVersion: 'local-package-v1',
      storyValidation: { valid: true },
    },
  ];
}
