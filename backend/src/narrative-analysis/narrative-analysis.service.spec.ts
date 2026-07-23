import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { GameLedgerService } from '../chess/game-ledger.service';
import type { GameLedger } from '../chess/models/game-ledger';
import { PieceIdentityService } from '../chess/piece-identity.service';
import type { PrismaService } from '../database/prisma.service';
import { PgnService } from '../pgn/pgn.service';
import type { NarrativeAnalysisProvider } from './llm-provider';
import type { NarrativeAnalysis } from './models/narrative-analysis';
import { NarrativeAnalysisService } from './narrative-analysis.service';
import { NarrativeAnalysisValidator } from './narrative-analysis.validator';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('NarrativeAnalysisService', () => {
  const pgn = new PgnService(new GameLedgerService(new PieceIdentityService()));
  const ledger = pgn.parse(
    '[White "Ada"]\n[Black "Turing"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0',
  ).ledger;

  const gameFindUnique = jest.fn();
  const runCreate = jest.fn();
  const runUpdate = jest.fn();
  const runFindUnique = jest.fn();
  const runFindFirst = jest.fn();
  const prisma = {
    game: { findUnique: gameFindUnique },
    generationRun: {
      create: runCreate,
      update: runUpdate,
      findUnique: runFindUnique,
      findFirst: runFindFirst,
    },
  } as unknown as PrismaService;
  const provider: NarrativeAnalysisProvider = {
    model: 'test-model',
    analyze: jest.fn(),
  };

  let service: NarrativeAnalysisService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NarrativeAnalysisService(
      prisma,
      provider,
      new NarrativeAnalysisValidator(),
    );
    gameFindUnique.mockResolvedValue({
      id: 'game-1',
      ledger: { data: ledger },
    });
    runCreate.mockResolvedValue({ id: 'run-1' });
    runUpdate.mockResolvedValue({ id: 'run-1' });
    runFindUnique.mockResolvedValue({
      id: 'run-1',
      status: 'COMPLETED',
      narrativeAnalysis: { data: makeAnalysis(ledger) },
    });
  });

  it('sends the complete ledger once and persists validated analysis', async () => {
    const analysis = makeAnalysis(ledger);
    jest.mocked(provider.analyze).mockResolvedValue(analysis);

    await expect(service.generate('game-1')).resolves.toMatchObject({
      id: 'run-1',
      status: 'COMPLETED',
    });

    expect(provider.analyze).toHaveBeenCalledTimes(1);
    expect(provider.analyze).toHaveBeenCalledWith({ ledger });
    expect(runCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        gameId: 'game-1',
        status: 'RUNNING',
        currentStage: 'NARRATIVE_ANALYSIS',
        model: 'test-model',
      }),
    });
    expect(runUpdate).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: 'COMPLETED',
        error: null,
        narrativeAnalysis: {
          create: {
            schemaVersion: 1,
            data: analysis,
          },
        },
      }),
    });
  });

  it('marks a run failed when analysis contradicts the ledger', async () => {
    jest.mocked(provider.analyze).mockResolvedValue({
      ...makeAnalysis(ledger),
      endingPlan: {
        ...makeAnalysis(ledger).endingPlan,
        winner: 'south',
      },
    });

    await expect(service.generate('game-1')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(runUpdate).toHaveBeenLastCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
    expect(runUpdate).toHaveBeenCalledTimes(1);
  });

  it('rejects generation when the saved ledger does not exist', async () => {
    gameFindUnique.mockResolvedValue(null);

    await expect(service.generate('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it('returns the latest completed analysis', async () => {
    gameFindUnique.mockResolvedValueOnce({ id: 'game-1' });
    runFindFirst.mockResolvedValue({ id: 'run-1' });

    await expect(service.findLatest('game-1')).resolves.toEqual({
      id: 'run-1',
    });
    expect(runFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          gameId: 'game-1',
          status: 'COMPLETED',
        }),
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
});

function makeAnalysis(ledger: GameLedger): NarrativeAnalysis {
  const queenId = ledger.events.at(-1)!.pieceId;
  return {
    titleConcepts: ['The Broken Seal'],
    dominantThemes: ['ambition', 'collapse'],
    gameShape: 'rapid-assault',
    gameClassificationReason: 'A direct attack ends the war quickly.',
    majorTurningPoints: [
      {
        startPly: 5,
        endPly: 7,
        importance: 'critical',
        chessSummary: 'The queen enters and delivers mate.',
        fantasyMeaning: 'The champion reaches the southern seal.',
      },
    ],
    acts: [
      {
        title: 'The Advance',
        startPly: 1,
        endPly: 4,
        purpose: 'Deploy the attackers.',
        emotionalTone: 'foreboding',
        majorCharacters: [queenId],
      },
      {
        title: 'The Broken Seal',
        startPly: 5,
        endPly: ledger.events.length,
        purpose: 'Pay off the assault.',
        emotionalTone: 'catastrophic',
        majorCharacters: [queenId],
      },
    ],
    characterImportance: [
      { pieceId: queenId, score: 10, reason: 'Delivers checkmate.' },
    ],
    characterArcs: [
      {
        pieceId: queenId,
        role: 'invading champion',
        introductionPly: 5,
        keyMoments: [5, 7],
        endingPly: null,
        personalityTraits: ['ruthless'],
        visualTraits: ['radiant blade', 'battle magic'],
        narrativeFunction: 'Carries the decisive assault.',
      },
    ],
    promotingPawnPlans: [],
    foreshadowing: [
      {
        payoffPly: 7,
        setupPlies: [5],
        setupDescription: 'The queen sights the southern seal.',
        payoffDescription: 'She reaches and breaks its defense.',
      },
    ],
    endingPlan: {
      winner: 'north',
      termination: 'checkmate',
      surrenderAttempt: false,
      kingdomConsequence: 'The southern realm fractures.',
      defeatedKingFate: 'The king falls with his seal.',
      finalImage: 'Dark towers folding into a red horizon.',
    },
    continuityConstraints: ['The captured soldier cannot return after ply 7.'],
  };
}
