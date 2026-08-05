import type { GameLedger } from '../chess/models/game-ledger';
import type { SceneBreakdown } from './models/scene-breakdown';
import { SceneBreakdownValidator } from './scene-breakdown.validator';

describe('SceneBreakdownValidator', () => {
  it('allows scene numbering to restart for each act', () => {
    const ledger = {
      pieces: [{ id: 'w-p-e2' }, { id: 'b-p-e7' }],
      events: [
        {
          ply: 1,
          san: 'e4',
          isCapture: false,
          isPromotion: false,
        },
        {
          ply: 2,
          san: 'e5',
          isCapture: false,
          isPromotion: false,
        },
      ],
    } as GameLedger;
    const base = {
      chessExplanation: 'A quiet advance.',
      fantasyNarration: 'A company advances without bloodshed.',
      characters: ['w-p-e2'],
      locations: ['central road'],
      deaths: [],
      promotions: [],
      visualPrompt: 'A company on a dark road.',
      videoPrompt: 'Slow forward movement.',
      estimatedDurationSeconds: 10,
      continuityNotes: ['No one dies.'],
    };
    const breakdown = {
      epilogue: 'The companies made camp beneath a silent sky.',
      laterEpilogueHeading: 'One Winter Later',
      laterEpilogue: 'Grass covered the road where their banners had passed.',
      defeatedKingDeathDescription: null,
      defeatedKingFate: 'survives',
      defeatedSealFate: 'intact',
      survivingFortressOutcomes: [],
      scenes: [
        {
          ...base,
          id: 'act-1-scene-1',
          actNumber: 1,
          sceneNumber: 1,
          startPly: 1,
          endPly: 1,
          involvedMoves: ['e4'],
        },
        {
          ...base,
          id: 'act-2-scene-1',
          actNumber: 2,
          sceneNumber: 1,
          startPly: 2,
          endPly: 2,
          involvedMoves: ['e5'],
          characters: ['b-p-e7'],
        },
      ],
    } satisfies SceneBreakdown;

    expect(() =>
      new SceneBreakdownValidator().validate(breakdown, ledger),
    ).not.toThrow();
  });

  it('rejects a scene that groups multiple plies', () => {
    const ledger = {
      pieces: [{ id: 'w-p-e2' }, { id: 'b-p-e7' }],
      events: [
        { ply: 1, san: 'e4', isCapture: false, isPromotion: false },
        { ply: 2, san: 'e5', isCapture: false, isPromotion: false },
      ],
    } as GameLedger;
    const breakdown = {
      epilogue: 'The companies made camp beneath a silent sky.',
      laterEpilogueHeading: 'One Winter Later',
      laterEpilogue: 'Grass covered the road where their banners had passed.',
      defeatedKingDeathDescription: null,
      defeatedKingFate: 'survives',
      defeatedSealFate: 'intact',
      survivingFortressOutcomes: [],
      scenes: [
        {
          id: 'grouped',
          actNumber: 1,
          sceneNumber: 1,
          startPly: 1,
          endPly: 2,
          involvedMoves: ['e4', 'e5'],
          chessExplanation: 'Two quiet moves.',
          fantasyNarration: 'Two companies advance.',
          characters: ['w-p-e2', 'b-p-e7'],
          locations: ['central road'],
          deaths: [],
          promotions: [],
          visualPrompt: 'Two armies.',
          videoPrompt: 'Two advances.',
          estimatedDurationSeconds: 10,
          continuityNotes: ['No combat.'],
        },
      ],
    } satisfies SceneBreakdown;

    expect(() =>
      new SceneBreakdownValidator().validate(breakdown, ledger),
    ).toThrow('exactly one scene per ply');
  });

  it('rejects structured capture identities that disagree with the ledger', () => {
    const ledger = {
      pieces: [{ id: 'w-p-e2' }, { id: 'b-p-e7' }],
      events: [
        {
          ply: 1,
          san: 'exd5',
          isCapture: true,
          pieceId: 'w-p-e2',
          capturedPieceId: 'b-p-e7',
          isPromotion: false,
        },
      ],
    } as GameLedger;
    const breakdown = {
      epilogue: 'The surviving company carried its wounded from the road.',
      laterEpilogueHeading: 'One Winter Later',
      laterEpilogue: 'A weathered monument stood where the company had fallen.',
      defeatedKingDeathDescription: null,
      defeatedKingFate: 'survives',
      defeatedSealFate: 'intact',
      survivingFortressOutcomes: [],
      scenes: [
        {
          id: 'capture',
          actNumber: 1,
          sceneNumber: 1,
          startPly: 1,
          endPly: 1,
          involvedMoves: ['exd5'],
          chessExplanation: 'A company captures another company.',
          fantasyNarration: 'The northern company broke the southern line.',
          characters: ['w-p-e2', 'b-p-e7'],
          locations: ['central road'],
          deaths: ['b-p-e7'],
          captureActorId: 'b-p-e7',
          captureVictimId: 'w-p-e2',
          promotions: [],
          visualPrompt: 'Two companies clash.',
          videoPrompt: 'The northern line advances.',
          estimatedDurationSeconds: 10,
          continuityNotes: [],
        },
      ],
    } satisfies SceneBreakdown;

    expect(() =>
      new SceneBreakdownValidator().validate(breakdown, ledger),
    ).toThrow('incorrect capture actor');
  });
});
