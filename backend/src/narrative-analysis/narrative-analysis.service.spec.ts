import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { GameLedgerService } from '../chess/game-ledger.service';
import type { GameLedger } from '../chess/models/game-ledger';
import { PieceIdentityService } from '../chess/piece-identity.service';
import type { PrismaService } from '../database/prisma.service';
import { GenerationPreparationService } from '../generation/generation-preparation.service';
import { PgnService } from '../pgn/pgn.service';
import type { NarrativeAnalysisProvider } from './llm-provider';
import type { NarrativeAnalysis } from './models/narrative-analysis';
import { NarrativeAnalysisService } from './narrative-analysis.service';
import { NarrativeAnalysisValidator } from './narrative-analysis.validator';
import { selectRequiredWoundEvents } from './wound-planning';
import { selectBattlefieldEnvironment } from '../chess/battlefield-environment';
import { classifySurrender } from '../chess/surrender-context';
import { buildEndingContract } from './ending-contract';

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
      new GenerationPreparationService(prisma),
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
    const endingContract = buildEndingContract(ledger);
    jest.mocked(provider.analyze).mockResolvedValue(analysis);

    await expect(service.generate('game-1')).resolves.toMatchObject({
      id: 'run-1',
      status: 'COMPLETED',
    });

    expect(provider.analyze).toHaveBeenCalledTimes(1);
    expect(provider.analyze).toHaveBeenCalledWith({
      ledger,
      requiredWoundEvents: selectRequiredWoundEvents(ledger),
      battlefieldEnvironment: selectBattlefieldEnvironment(ledger),
      surrenderContext: classifySurrender(ledger),
      endingContract: buildEndingContract(ledger),
      telemetry: {
        gameId: 'game-1',
        generationRunId: 'run-1',
        attempt: 1,
        repairMode: 'none',
      },
    });
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
            data: {
              ...analysis,
              endingPlan: {
                ...analysis.endingPlan,
                aftermathFocus: endingContract.creativeDirection.aftermathFocus,
                laterChronicleLens:
                  endingContract.creativeDirection.laterChronicleLens,
                laterChronicleCliffhanger:
                  endingContract.creativeDirection.laterChronicleCliffhanger,
              },
            },
          },
        },
      }),
    });
  });

  it('normalizes deterministic ending facts instead of failing or retrying', async () => {
    jest.mocked(provider.analyze).mockResolvedValue({
      ...makeAnalysis(ledger),
      endingPlan: {
        ...makeAnalysis(ledger).endingPlan,
        winner: 'south',
      },
    });

    await expect(service.generate('game-1')).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    expect(runUpdate).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: 'COMPLETED',
        narrativeAnalysis: {
          create: {
            schemaVersion: 1,
            data: expect.objectContaining({
              endingPlan: expect.objectContaining({
                winner: 'north',
                termination: 'checkmate',
                surrenderAttempt: false,
                defeatedKingFate: 'killed-after-checkmate',
              }),
            }),
          },
        },
      }),
    });
  });

  it('rejects a lasting wound that is not anchored to the character’s capture', () => {
    const analysis = makeAnalysis(ledger);
    analysis.woundPlans = [
      {
        pieceId: ledger.events.at(-1)!.pieceId,
        inflictedAtPly: 1,
        injury: 'Her sword arm is severed below the elbow.',
        lastingEffects: ['She must fight one-handed.'],
        recoveryPly: null,
      },
    ];

    expect(() =>
      new NarrativeAnalysisValidator().validate(analysis, ledger),
    ).toThrow('must be inflicted while that character survives');
  });

  it('rejects names and piece IDs inside structured wound status text', () => {
    const analysis = makeAnalysis(ledger);
    const event = ledger.events.at(-1)!;
    const otherName = ledger.pieces.find(
      (piece) => piece.id !== event.pieceId,
    )!.permanentName;
    analysis.woundPlans = [
      {
        pieceId: event.pieceId,
        inflictedAtPly: event.ply,
        injury: `${otherName}'s arm is burned by b-p-f7.`,
        lastingEffects: ['Pain returns near w-q-d1.'],
        recoveryPly: null,
      },
    ];

    expect(() =>
      new NarrativeAnalysisValidator().validate(analysis, ledger),
    ).toThrow(
      'must not contain names, piece IDs, coordinates, or ply references',
    );
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
  const southernKingId = ledger.pieces.find(
    (piece) => piece.chessColor === 'b' && piece.chessType === 'k',
  )!.id;
  const northernBishopId = ledger.pieces.find(
    (piece) => piece.chessColor === 'w' && piece.chessType === 'b',
  )!.id;
  return {
    battlefieldEnvironment: selectBattlefieldEnvironment(ledger),
    surrenderContext: classifySurrender(ledger),
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
    relationshipPlans: [
      {
        id: 'queen-king-rivalry',
        characterIds: [queenId, southernKingId],
        relationshipType: 'rivalry',
        startingDynamic: 'The King dismisses the approaching champion.',
        developmentPlies: [5, 7],
        payoffPly: 7,
        intendedChange: 'Dismissal becomes fatal recognition.',
      },
      {
        id: 'bishop-queen-trust',
        characterIds: [northernBishopId, queenId],
        relationshipType: 'battlefield trust',
        startingDynamic: 'The Archwizard opens a path for the Queen.',
        developmentPlies: [3, 5],
        payoffPly: 7,
        intendedChange: 'Their coordinated assault breaks the final defense.',
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
    woundPlans: selectRequiredWoundEvents(ledger).map((event) => ({
      pieceId: event.pieceId,
      inflictedAtPly: event.inflictedAtPly,
      injury: 'A deep blade wound tears across her sword arm.',
      lastingEffects: ['Pain weakens her grip for the rest of the battle.'],
      recoveryPly: null,
    })),
    endingPlan: {
      winner: 'north',
      termination: 'checkmate',
      surrenderAttempt: false,
      kingdomConsequence: 'The southern realm fractures.',
      defeatedKingFate: 'killed-after-checkmate',
      finalImage: 'Dark towers folding into a red horizon.',
      aftermathFocus: 'survivor-grief-and-personal-reckoning',
      laterChronicleLens: 'a-descendant-inheriting-an-unwanted-legacy',
    },
    continuityConstraints: ['The captured soldier cannot return after ply 7.'],
  };
}
