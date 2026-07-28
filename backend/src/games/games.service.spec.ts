import { NotFoundException } from '@nestjs/common';
import { GameLedgerService } from '../chess/game-ledger.service';
import { PieceIdentityService } from '../chess/piece-identity.service';
import type { PrismaService } from '../database/prisma.service';
import { PgnService } from '../pgn/pgn.service';
import { GamesService } from './games.service';

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
        ledger: { schemaVersion: 4 },
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
      schemaVersion: 4,
      data: {},
    });

    await service.create(
      '[White "Ada"]\n[Black "Turing"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
    );

    expect(gameLedgerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gameId: 'existing-game' },
        data: expect.objectContaining({
          schemaVersion: 4,
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
    expect(createArgs.data.ledger.create.schemaVersion).toBe(4);
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
