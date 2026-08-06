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
    },
    sagaGenerationJob: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jobUpdate.mockResolvedValue({}),
      updateMany: jobUpdateMany,
      upsert: jest.fn().mockResolvedValue({}),
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
  } as unknown as PushNotificationService;
  let service: SagaGenerationService;

  beforeEach(() => {
    jest.clearAllMocks();
    runs.length = 0;
    service = new SagaGenerationService(
      prisma,
      analysis,
      outline,
      story,
      validation,
      scenes,
      pushNotifications,
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
