import type { GameLedger } from '../chess/models/game-ledger';
import type { SceneBreakdown } from './models/scene-breakdown';
import { normalizeLedgerOwnedSceneFacts } from './scene-breakdown.service';
import { SceneBreakdownValidator } from './scene-breakdown.validator';

describe('deterministic scene finalization', () => {
  it('finalizes a synthetic 133-ply story without an AI response', () => {
    const events = Array.from({ length: 133 }, (_, index) => ({
      ply: index + 1,
      san: index % 2 === 0 ? 'Ka2' : 'Ka7',
      pieceId: index % 2 === 0 ? 'w-k-e1' : 'b-k-e8',
      isCapture: false,
      isPromotion: false,
    }));
    const ledger = {
      metadata: {
        whitePlayer: 'White',
        blackPlayer: 'Black',
        result: '1/2-1/2',
        termination: 'draw',
      },
      pieces: [
        { id: 'w-k-e1', side: 'north', alive: true },
        { id: 'b-k-e8', side: 'south', alive: true },
      ],
      events,
    } as unknown as GameLedger;
    const scenes = events.map((event, index) => ({
      id: `generated-${event.ply}`,
      actNumber: index < 66 ? 1 : 2,
      sceneNumber: 999,
      startPly: event.ply,
      endPly: event.ply,
      involvedMoves: ['wrong'],
      chessExplanation: 'The King relocates.',
      fantasyNarration: `Narrative beat ${event.ply}.`,
      characters: [event.pieceId],
      locations: ['ruined road'],
      deaths: [],
      promotions: [],
      visualPrompt: 'A King on a ruined road.',
      videoPrompt: 'The King moves through rain.',
      estimatedDurationSeconds: 8,
      continuityNotes: ['The journey continues.'],
    }));
    const source = {
      scenes,
      wounds: [],
      epilogue: 'Both Kings withdrew while their surviving soldiers watched.',
      laterEpilogueHeading: 'One Winter Later',
      laterEpilogue: 'The ruined road remained between the two kingdoms.',
      defeatedKingDeathDescription: null,
      defeatedKingFate: 'survives',
      defeatedSealFate: 'intact',
      survivingFortressOutcomes: [],
    } as SceneBreakdown;

    const finalized = normalizeLedgerOwnedSceneFacts(source, ledger);

    expect(finalized.scenes).toHaveLength(133);
    expect(finalized.scenes[0]).toMatchObject({
      id: 'ply-1',
      sceneNumber: 1,
      involvedMoves: ['Ka2'],
    });
    expect(finalized.scenes[66]).toMatchObject({
      id: 'ply-67',
      sceneNumber: 1,
    });
    expect(finalized.scenes[132].endPly).toBe(133);
    expect(() =>
      new SceneBreakdownValidator().validate(finalized, ledger),
    ).not.toThrow();
  });
});
