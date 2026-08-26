import type { GameLedger } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import type { StoryOutline } from '../story-outline/models/story-outline';
import {
  buildDeathContracts,
  buildEndingDeathContract,
  buildEndingWorldState,
  buildFortressOperatingTimeline,
  buildWoundStateByPly,
  buildWoundTimeline,
  deriveSceneWoundReferences,
  isAmbiguousTimedFateFinding,
  normalizeStructuredCaptureMetadata,
} from './full-story.service';

describe('semantic premature-death fallback selection', () => {
  it('sends ambiguous recoil language for semantic adjudication', () => {
    expect(
      isAmbiguousTimedFateFinding({
        type: 'invented-capture',
        severity: 'error',
        message: 'Northeast Archwizard is described as dead before capture',
        ply: 33,
        pieceId: 'w-b-c1',
        excerpt:
          "spell at contact, sending a hard recoil into Gwendolyn's chest",
      }),
    ).toBe(true);
  });

  it('keeps explicit death language deterministic and blocking', () => {
    expect(
      isAmbiguousTimedFateFinding({
        type: 'invented-capture',
        severity: 'error',
        message: 'Northeast Archwizard is described as dead before capture',
        ply: 33,
        pieceId: 'w-b-c1',
        excerpt: "Gwendolyn's final breath",
      }),
    ).toBe(false);
  });
});

describe('full-story wound timing preparation', () => {
  it('keeps a wounded Fortress powered through battle and depowers it only afterward', () => {
    const ledger = {
      metadata: { result: '0-1', termination: 'checkmate' },
      events: Array.from({ length: 5 }, (_, index) => ({ ply: index + 1 })),
      pieces: [
        {
          id: 'w-r-a1',
          side: 'north',
          alive: true,
          fantasyType: 'moving-fortress',
          permanentName: 'Northeast Fortress',
          operatorName: 'Mirelle',
        },
      ],
    } as GameLedger;
    const endingWorldState = {
      termination: 'checkmate',
      defeatedSide: 'north',
      defeatedSealFate: 'destroyed',
      surrenderContext: null,
      survivingFortresses: [
        {
          pieceId: 'w-r-a1',
          operatorName: 'Mirelle',
          side: 'north',
          powerOutcome: 'loses-seal-power',
        },
      ],
    } as ReturnType<typeof buildEndingWorldState>;

    expect(
      buildFortressOperatingTimeline(
        ledger,
        [
          {
            pieceId: 'w-r-a1',
            inflictedAtPly: 3,
            activeThroughPly: 5,
          },
        ] as Parameters<typeof buildFortressOperatingTimeline>[1],
        endingWorldState,
      ),
    ).toEqual([
      {
        pieceId: 'w-r-a1',
        operatorName: 'Mirelle',
        stateIntervals: [
          { startPly: 1, endPly: 2, state: 'operational' },
          { startPly: 3, endPly: 5, state: 'damaged-but-mobile' },
        ],
        afterBattleState: 'depowered-by-seal-loss',
      },
    ]);
  });

  it('keeps a victorious surviving Fortress powered by its intact Seal', () => {
    const ledger = {
      metadata: { result: '0-1', termination: 'resignation' },
      pieces: [
        {
          id: 'b-r-a8',
          side: 'south',
          alive: true,
          fantasyType: 'moving-fortress',
          currentChessType: 'r',
          permanentName: 'Southeast Fortress',
          operatorName: 'Leoric',
        },
        {
          id: 'w-r-a1',
          side: 'north',
          alive: false,
          fantasyType: 'moving-fortress',
          currentChessType: 'r',
          permanentName: 'Northeast Fortress',
          operatorName: 'Theron',
        },
      ],
    } as GameLedger;
    const analysis = {
      surrenderContext: {
        judgment: 'necessary',
        materialBalance: -14,
        legalMoveCount: 2,
        inCheck: true,
        safeFromImmediateMateMoveCount: 2,
        allowedFates: ['spends-seal-to-save-subjects'],
        rationale: 'Continued resistance would sacrifice civilians.',
      },
      endingPlan: {
        defeatedKingFate: 'spends-seal-to-save-subjects',
      },
    } as NarrativeAnalysis;

    expect(buildEndingWorldState(ledger, analysis)).toEqual({
      termination: 'resignation',
      defeatedSide: 'north',
      defeatedSealFate: 'destroyed',
      surrenderContext: analysis.surrenderContext,
      survivingFortresses: [
        {
          pieceId: 'b-r-a8',
          operatorName: 'Leoric',
          side: 'south',
          powerOutcome: 'retains-seal-power',
        },
      ],
    });
  });

  it('turns planned wounds into explicit prohibited, infliction, and active windows', () => {
    const ledger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Northeast Fortress',
          operatorName: 'Theron',
        },
      ],
      events: Array.from({ length: 60 }, (_, index) => ({ ply: index + 1 })),
    } as GameLedger;
    const analysis = {
      woundPlans: [
        {
          pieceId: 'w-r-a1',
          inflictedAtPly: 55,
          woundCatalogId: 'fortress-hull-breach',
          injury: 'cracked ward plates',
          lastingEffects: ['exposed maintenance channels'],
          recoveryPly: null,
        },
      ],
    } as NarrativeAnalysis;
    const outline = {
      woundBeats: [
        {
          pieceId: 'w-r-a1',
          inflictedAtPly: 55,
          injury: 'cracked ward plates',
          continuityPlies: [55, 58],
          recoveryPly: null,
        },
      ],
    } as StoryOutline;

    expect(buildWoundTimeline(ledger, analysis, outline)).toMatchObject([
      {
        woundId: 'wound:w-r-a1:55',
        pieceId: 'w-r-a1',
        characterNames: ['Theron', 'Northeast Fortress'],
        injury: 'cracked ward plates',
        lastingEffects: ['exposed maintenance channels'],
        prohibitedBeforePly: 54,
        inflictedAtPly: 55,
        activeThroughPly: 60,
        recoveryPly: null,
        causeType: undefined,
        sourcePieceId: undefined,
        sourceNames: [],
      },
    ]);
  });

  it('builds scene-specific wound permission snapshots', () => {
    expect(
      buildWoundStateByPly(5, [
        {
          woundId: 'wound:w-q-d1:2',
          pieceId: 'w-q-d1',
          characterNames: ['Queen Lyra'],
          injury: 'cut shoulder',
          lastingEffects: ['pain'],
          prohibitedBeforePly: 1,
          inflictedAtPly: 2,
          activeThroughPly: 3,
          recoveryPly: 4,
          causeType: 'victim-retaliation',
          sourcePieceId: 'b-p-a7',
          sourceNames: ['Tarin'],
        },
      ]),
    ).toEqual([
      {
        ply: 2,
        newlyInflictedWoundIds: ['wound:w-q-d1:2'],
        activeWoundIds: ['wound:w-q-d1:2'],
      },
      {
        ply: 3,
        newlyInflictedWoundIds: [],
        activeWoundIds: ['wound:w-q-d1:2'],
      },
    ]);
  });

  it('derives wound references from scene characters and active timing', () => {
    const wounds = [
      {
        pieceId: 'w-p-d2',
        inflictedAtPly: 3,
        injury: 'burned hand',
        lastingEffects: ['weak grip'],
        recoveryPly: 6,
      },
      {
        pieceId: 'b-p-e7',
        inflictedAtPly: 4,
        injury: 'cut shoulder',
        lastingEffects: ['limited reach'],
        recoveryPly: null,
      },
    ];

    expect(
      deriveSceneWoundReferences(
        [
          { startPly: 3, characters: ['w-p-d2'] },
          { startPly: 4, characters: ['b-p-e7'] },
          { startPly: 5, characters: ['w-p-d2', 'b-p-e7'] },
          { startPly: 6, characters: ['w-p-d2'] },
          { startPly: 7, characters: ['b-p-e7'] },
        ],
        wounds,
      ),
    ).toEqual([
      {
        ply: 3,
        woundReferences: [
          { woundId: 'wound:w-p-d2:3', ownerPieceId: 'w-p-d2' },
        ],
      },
      {
        ply: 4,
        woundReferences: [
          { woundId: 'wound:b-p-e7:4', ownerPieceId: 'b-p-e7' },
        ],
      },
      {
        ply: 5,
        woundReferences: [
          { woundId: 'wound:w-p-d2:3', ownerPieceId: 'w-p-d2' },
          { woundId: 'wound:b-p-e7:4', ownerPieceId: 'b-p-e7' },
        ],
      },
      { ply: 6, woundReferences: [] },
      {
        ply: 7,
        woundReferences: [
          { woundId: 'wound:b-p-e7:4', ownerPieceId: 'b-p-e7' },
        ],
      },
    ]);
  });

  it('authorizes the defeated King as the sole death on the final checkmate ply', () => {
    const ledger = {
      metadata: { result: '0-1', termination: 'checkmate' },
      pieces: [
        {
          id: 'w-k-e1',
          side: 'north',
          fantasyType: 'king',
          permanentName: 'Northern King',
          characterName: 'Orin',
        },
        {
          id: 'b-q-d8',
          side: 'south',
          fantasyType: 'queen',
          permanentName: 'Southern Queen',
          characterName: 'Lyra',
        },
      ],
      events: [
        {
          ply: 1,
          pieceId: 'b-q-d8',
          pieceType: 'queen',
          isCapture: false,
          isCheckmate: true,
          checkmateExplanation: { kingId: 'w-k-e1' },
        },
      ],
    } as GameLedger;

    const contracts = buildDeathContracts(ledger);
    expect(contracts).toMatchObject([
      {
        ply: 1,
        authorizedVictimId: 'w-k-e1',
        authorizedVictimNames: ['Orin', 'Northern King'],
        noOtherDeaths: true,
        eventKind: 'checkmate',
        decisiveActorId: 'b-q-d8',
      },
    ]);
    expect(contracts[0].deathCatalogId).not.toBeNull();
    expect(contracts[0].targetArea).not.toBe('royal-seal-bond');
    expect(contracts[0].narrationGuidance).toContain('King');
  });

  it('catalogs a rejected-surrender execution as an ending death', () => {
    const ledger = {
      metadata: { result: '0-1', termination: 'resignation' },
      pieces: [
        {
          id: 'w-k-e1',
          side: 'north',
          fantasyType: 'king',
          permanentName: 'Northern King',
          characterName: 'Orin',
        },
      ],
      events: [{ ply: 12 }],
    } as GameLedger;
    const analysis = {
      endingPlan: {
        defeatedKingFate: 'executed-after-rejected-surrender',
      },
    } as NarrativeAnalysis;

    expect(buildEndingDeathContract(ledger, analysis)).toMatchObject({
      ply: 12,
      authorizedVictimId: 'w-k-e1',
      deathCatalogId: 'king-surrender-execution',
      eventKind: 'rejected-surrender',
    });
  });

  it('normalizes AI capture metadata from the ledger while keeping checkmate narrative-only', () => {
    const ledger = {
      events: [
        {
          ply: 1,
          pieceId: 'b-r-h8',
          isCapture: false,
          capturedPieceId: undefined,
          isCheckmate: true,
        },
      ],
    } as GameLedger;

    expect(
      normalizeStructuredCaptureMetadata(
        [
          {
            ply: 1,
            captureActorId: 'b-r-h8',
            captureVictimId: 'w-k-e1',
            victimDies: true,
            fantasyNarration: 'The final cannon blast killed King Orin.',
          },
        ],
        ledger,
      ),
    ).toEqual([
      {
        ply: 1,
        captureActorId: null,
        captureVictimId: null,
        victimDies: false,
        fantasyNarration: 'The final cannon blast killed King Orin.',
      },
    ]);
  });
});
