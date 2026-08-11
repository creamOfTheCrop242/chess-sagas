import { NotFoundException } from '@nestjs/common';
import { GameLedgerService } from '../chess/game-ledger.service';
import { PieceIdentityService } from '../chess/piece-identity.service';
import type { PrismaService } from '../database/prisma.service';
import { PgnService } from '../pgn/pgn.service';
import { GamesService } from './games.service';
import { NARRATIVE_ANALYSIS_PROMPT_VERSION } from '../narrative-analysis/narrative-analysis.prompt';
import { STORY_OUTLINE_PROMPT_VERSION } from '../story-outline/story-outline.prompt';
import { FULL_STORY_PROMPT_VERSION } from '../full-story/full-story.prompt';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('GamesService', () => {
  const gameCreate = jest.fn<(args: unknown) => Promise<{ id: string }>>();
  const gameFindMany = jest.fn<(args: unknown) => Promise<unknown[]>>();
  const gameFindFirst =
    jest.fn<
      (args: unknown) => Promise<{ id: string; ledger: object } | null>
    >();
  const gameFindUnique =
    jest.fn<
      (args: unknown) => Promise<{ id: string; ledger: object } | null>
    >();
  const gameLedgerUpdate =
    jest.fn<
      (args: unknown) => Promise<{ schemaVersion: number; data: object }>
    >();
  const prisma = {
    game: {
      create: gameCreate,
      findFirst: gameFindFirst,
      findMany: gameFindMany,
      findUnique: gameFindUnique,
    },
    gameLedger: {
      update: gameLedgerUpdate,
    },
  } as unknown as PrismaService;

  let service: GamesService;

  beforeEach(() => {
    jest.clearAllMocks();
    gameFindFirst.mockResolvedValue(null);
    const identities = new PieceIdentityService();
    const pgn = new PgnService(new GameLedgerService(identities));
    service = new GamesService(prisma, pgn);
  });

  it('reuses the latest saved game with the same PGN hash', async () => {
    let capturedArgs: unknown;
    gameFindFirst.mockImplementation((args) => {
      capturedArgs = args;
      return Promise.resolve({
        id: 'existing-game',
        ledger: { schemaVersion: 6 },
      });
    });

    await expect(
      service.create(
        '[White "Ada"]\n[Black "Turing"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
      ),
    ).resolves.toMatchObject({ id: 'existing-game' });

    expect(gameCreate).not.toHaveBeenCalled();
    expect(gameLedgerUpdate).not.toHaveBeenCalled();
    const findArgs = capturedArgs as { where: { pgnHash: string } };
    expect(findArgs.where.pgnHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('upgrades an existing fixed-name ledger to randomized names', async () => {
    gameFindFirst.mockResolvedValue({
      id: 'existing-game',
      ledger: { schemaVersion: 3 },
    });
    gameLedgerUpdate.mockResolvedValue({
      schemaVersion: 6,
      data: {},
    });

    await service.create(
      '[White "Ada"]\n[Black "Turing"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
    );

    expect(gameLedgerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gameId: 'existing-game' },
        data: expect.objectContaining({
          schemaVersion: 6,
          data: expect.objectContaining({
            pieces: expect.arrayContaining([
              expect.objectContaining({
                chessType: 'p',
                viewpointName: expect.any(String),
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it('persists a parsed game and immutable ledger in one nested create', async () => {
    let capturedArgs: unknown;
    gameCreate.mockImplementation((args) => {
      capturedArgs = args;
      return Promise.resolve({ id: 'game-1' });
    });

    await expect(
      service.create(
        '[White "Ada"]\n[Black "Turing"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0',
      ),
    ).resolves.toEqual({ id: 'game-1' });

    expect(gameCreate).toHaveBeenCalledTimes(1);
    const createArgs = capturedArgs as {
      data: {
        pgnHash: string;
        whitePlayer: string;
        blackPlayer: string;
        result: string;
        ledger: {
          create: {
            schemaVersion: number;
            data: { events: Array<{ san: string; isCheckmate: boolean }> };
          };
        };
      };
      include: { ledger: boolean };
    };
    expect(createArgs.data.pgnHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createArgs.data).toMatchObject({
      whitePlayer: 'Ada',
      blackPlayer: 'Turing',
      result: '1-0',
    });
    expect(createArgs.data.ledger.create.schemaVersion).toBe(6);
    expect(createArgs.data.ledger.create.data.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ san: 'Qxf7#', isCheckmate: true }),
      ]),
    );
    expect(createArgs.include).toEqual({ ledger: true });
  });

  it('returns summaries newest first', async () => {
    gameFindMany.mockResolvedValue([]);

    await expect(service.findAll()).resolves.toEqual([]);
    expect(gameFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('returns all reusable pipeline stages from one game query', async () => {
    gameFindUnique.mockResolvedValue({
      id: 'game-1',
      generationRuns: [
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
      ],
    } as never);

    await expect(service.pipelineStatus('game-1')).resolves.toEqual({
      analysis: true,
      outline: true,
      story: true,
      validation: true,
      scenes: true,
    });
    expect(gameFindUnique).toHaveBeenCalledTimes(1);
  });

  it('does not reuse artifacts produced by stale prompt versions', async () => {
    gameFindUnique.mockResolvedValue({
      id: 'game-1',
      generationRuns: [
        {
          currentStage: 'NARRATIVE_ANALYSIS',
          promptVersion: 'old-analysis',
          narrativeAnalysis: { id: 'analysis-1' },
        },
      ],
    } as never);

    await expect(service.pipelineStatus('game-1')).resolves.toEqual({
      analysis: false,
      outline: false,
      story: false,
      validation: false,
      scenes: false,
    });
  });

  it('returns only completed saga records with their completion time', async () => {
    gameFindMany.mockResolvedValue([
      {
        id: 'game-1',
        whitePlayer: 'Ada',
        blackPlayer: 'Turing',
        result: '1-0',
        createdAt: new Date('2026-07-01'),
        updatedAt: new Date('2026-07-02'),
        generationRuns: [
          {
            completedAt: new Date('2026-07-03'),
            sceneBreakdown: { createdAt: new Date('2026-07-03') },
            generatedStory: null,
          },
          {
            completedAt: new Date('2026-07-02'),
            sceneBreakdown: null,
            generatedStory: { title: 'The Spear That Broke a Crown' },
          },
        ],
      },
    ]);

    await expect(service.findRecords()).resolves.toEqual([
      expect.objectContaining({
        id: 'game-1',
        title: 'The Spear That Broke a Crown',
        completedAt: new Date('2026-07-03'),
      }),
    ]);
    expect(gameFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          generationRuns: {
            some: {
              status: 'COMPLETED',
              sceneBreakdown: { isNot: null },
            },
          },
        },
      }),
    );
  });

  it('replaces spoiler and coordinate titles in the Hall of Records', async () => {
    gameFindMany.mockResolvedValue([
      {
        id: 'game-spoiler',
        whitePlayer: 'Ada',
        blackPlayer: 'Turing',
        result: '1-0',
        createdAt: new Date('2026-07-01'),
        updatedAt: new Date('2026-07-02'),
        ledger: { data: null },
        generationRuns: [
          {
            completedAt: new Date('2026-07-03'),
            sceneBreakdown: { createdAt: new Date('2026-07-03') },
            generatedStory: null,
          },
          {
            completedAt: new Date('2026-07-02'),
            sceneBreakdown: null,
            generatedStory: { title: 'The Seal-Breaking Checkmate at H8' },
          },
        ],
      },
    ]);

    const [record] = await service.findRecords();
    expect(record.title).toMatch(/^The (Battle|Clash|War) /);
    expect(record.title).not.toMatch(/checkmate|[a-h][1-8]/i);
  });

  it('returns the latest completed saga for replay', async () => {
    gameFindUnique.mockResolvedValue({
      id: 'game-1',
      rawPgn: '1. e4 e5',
      whitePlayer: 'Ada',
      blackPlayer: 'Turing',
      result: '1-0',
      createdAt: new Date('2026-07-01'),
      ledger: { data: { pieces: [{ operatorName: 'Ysabet' }] } },
      generationRuns: [
        {
          completedAt: new Date('2026-07-03'),
          sceneBreakdown: {
            data: { scenes: [] },
            createdAt: new Date('2026-07-03'),
          },
        },
      ],
    } as never);

    await expect(service.findRecord('game-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'game-1',
        rawPgn: '1. e4 e5',
        sceneBreakdown: expect.objectContaining({
          data: { scenes: [] },
        }),
        ledger: {
          data: { pieces: [{ operatorName: 'Ysabet' }] },
        },
      }),
    );
  });

  it('returns a saved game with its pipeline records', async () => {
    gameFindUnique.mockResolvedValue({ id: 'game-1', ledger: {} });

    await expect(service.findOne('game-1')).resolves.toMatchObject({
      id: 'game-1',
    });
    expect(gameFindUnique).toHaveBeenCalledWith({
      where: { id: 'game-1' },
      include: {
        ledger: true,
        generationRuns: {
          include: {
            narrativeAnalysis: true,
            storyOutline: true,
            generatedStory: true,
            storyValidation: true,
            sceneBreakdown: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  });

  it('throws when a game does not exist', async () => {
    gameFindUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
