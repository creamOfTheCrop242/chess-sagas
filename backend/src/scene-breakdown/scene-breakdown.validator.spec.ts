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
});
