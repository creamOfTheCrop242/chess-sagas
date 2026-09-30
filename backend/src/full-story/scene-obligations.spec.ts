import {
  buildRevengeRoles,
  buildSceneObligations,
  obligationFindings,
} from './scene-obligations';
import { buildEndingWorldState } from './full-story.service';
import type { GameLedger } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';

describe('shared scene obligations', () => {
  const ledger = {
    pieces: [
      { id: 'lucan', characterName: 'Lucan' },
      { id: 'magnus', characterName: 'Magnus' },
      { id: 'kerra', characterName: 'Kerra' },
    ],
    events: [
      { ply: 40, pieceId: 'magnus', capturedPieceId: 'kerra' },
      {
        ply: 47,
        pieceId: 'lucan',
        capturedPieceId: 'magnus',
        interactionContext: {
          avengesDeaths: [{ deathPly: 40, victimPieceId: 'kerra' }],
        },
      },
    ],
  } as unknown as GameLedger;
  it('derives revenge direction from both ledger captures', () => {
    const result = buildRevengeRoles(ledger, [{ deathPly: 40, payoffPly: 47 }]);
    expect(result[0]).toMatchObject({
      avengerId: 'lucan',
      killerId: 'magnus',
      fallenAllyId: 'kerra',
    });
    expect(result[0].direction).toContain('Magnus killed Kerra');
    expect(
      buildRevengeRoles(ledger, [{ deathPly: 39, payoffPly: 47 }]),
    ).toEqual([]);
  });
  it('includes the check obligation even when the repair targets a wound', () => {
    const result = buildSceneObligations(
      ledger,
      [],
      [],
      [
        {
          ply: 39,
          checkingPieceId: 'kerra',
          checkingPieceNames: ['Kerra'],
          damagedKingId: 'bram',
          damagedKingNames: ['Bram'],
          protectedKingId: 'darius',
          protectedKingNames: ['Darius'],
        },
      ],
      [],
      [],
    );
    expect(result[0]).toMatchObject({ ply: 39, id: '39:check' });
    expect(result[0].requirement).toContain('NEW royal strain');
  });
  const obligations = [
    { id: '39:check', ply: 39, requirement: 'Bram suffers new check strain' },
  ];
  const scenes = [
    {
      ply: 39,
      fantasyNarration: 'Kerra killed Rhiannon. The Fortress kept moving.',
    },
  ];
  it('routes grounded high-confidence omissions back to repair', () => {
    expect(
      obligationFindings(obligations, scenes, [
        {
          obligationId: '39:check',
          status: 'omitted',
          confidence: 'high',
          excerpt: 'The Fortress kept moving.',
          reason: 'No attack or new strain reaches Bram',
        },
      ])[0].severity,
    ).toBe('error');
  });
  it('keeps uncertain and fabricated evidence nonblocking', () => {
    for (const excerpt of ['Nonexistent text', 'The Fortress kept moving.']) {
      expect(
        obligationFindings(obligations, scenes, [
          {
            obligationId: '39:check',
            status: 'uncertain',
            confidence: 'high',
            excerpt,
            reason: 'Ambiguous',
          },
        ])[0].severity,
      ).toBe('warning');
    }
    expect(
      obligationFindings(obligations, scenes, [
        {
          obligationId: '39:check',
          status: 'contradiction',
          confidence: 'high',
          excerpt: 'Invented quotation',
          reason: 'Claim',
        },
      ])[0].severity,
    ).toBe('warning');
  });
  it('does not treat incomplete assessments as a pass', () => {
    expect(() => obligationFindings(obligations, scenes, [])).toThrow(
      'Incomplete',
    );
  });
});

describe('ending power availability', () => {
  const ledger = {
    metadata: { result: '1-0', termination: 'checkmate' },
    pieces: [
      {
        id: 'falk',
        characterName: 'Falk',
        side: 'south',
        alive: true,
        chessType: 'p',
        currentChessType: 'p',
        pawnAbilityContract: { canCastMagic: true },
      },
      {
        id: 'lucan',
        side: 'north',
        alive: true,
        chessType: 'b',
        currentChessType: 'b',
      },
      {
        id: 'promoted',
        side: 'north',
        alive: true,
        chessType: 'p',
        currentChessType: 'q',
      },
      {
        id: 'soldier',
        side: 'north',
        alive: true,
        chessType: 'p',
        currentChessType: 'p',
        pawnAbilityContract: { canCastMagic: false },
      },
    ],
  } as unknown as GameLedger;
  it('disables Falk after Seal loss without disabling victorious or promoted casters', () => {
    const analysis = {
      endingPlan: { defeatedKingFate: 'killed-after-checkmate' },
    } as NarrativeAnalysis;
    const states = buildEndingWorldState(
      ledger,
      analysis,
    ).characterPowerStates!;
    expect(states.map((s) => [s.pieceId, s.personalCastingAvailable])).toEqual([
      ['falk', false],
      ['lucan', true],
      ['promoted', true],
      ['soldier', false],
    ]);
  });
  it('preserves casting with an intact surrendered Seal', () => {
    const analysis = {
      endingPlan: {
        defeatedKingFate: 'refuses-seal-destruction-and-is-imprisoned',
      },
    } as NarrativeAnalysis;
    expect(
      buildEndingWorldState(ledger, analysis).characterPowerStates![0]
        .personalCastingAvailable,
    ).toBe(true);
  });
});
