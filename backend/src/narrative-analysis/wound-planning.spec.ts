import type { FantasyPieceType, GameLedger } from '../chess/models/game-ledger';
import {
  deterministicWoundRoll,
  selectWoundCause,
  selectRequiredWoundEvents,
  woundProbability,
} from './wound-planning';

describe('wound planning', () => {
  const ledger = {
    metadata: {
      date: '2026.07.28',
      whitePlayer: 'Ada',
      blackPlayer: 'Turing',
    },
    survivors: ['w-p-a2', 'w-q-d1'],
    pieces: [
      piece('w-p-a2', 'Mara'),
      piece('w-q-d1', 'Lyra'),
      piece('b-q-d8', 'Vesper'),
      piece('b-p-a7', 'Nessa'),
      piece('b-r-a8', 'Torren'),
    ],
    events: [
      capture(1, 'w-p-a2', 'grunt', 'b-q-d8', 'queen'),
      capture(2, 'w-q-d1', 'queen', 'b-p-a7', 'grunt'),
      capture(3, 'b-r-a8', 'moving-fortress', 'w-p-a2', 'grunt'),
    ],
  } as GameLedger;

  it('uses the configured odds for combat-tier differences', () => {
    expect(woundProbability('grunt', 'queen')).toBe(0.9);
    expect(woundProbability('grunt', 'moving-fortress')).toBe(0.75);
    expect(woundProbability('archwizard', 'moving-fortress')).toBe(0.6);
    expect(woundProbability('queen', 'queen')).toBe(0.4);
    expect(woundProbability('queen', 'moving-fortress')).toBe(0.2);
    expect(woundProbability('queen', 'grunt')).toBe(0.08);
  });

  it('uses stable seeded rolls for captors even when they die later', () => {
    expect(selectRequiredWoundEvents(ledger)).toEqual(
      selectRequiredWoundEvents(ledger),
    );
    const laterDeadCapture = ledger.events[2];
    const laterDeadRoll = deterministicWoundRoll(
      ledger,
      laterDeadCapture,
      ledger.pieces.find((piece) => piece.id === laterDeadCapture.pieceId),
      ledger.pieces.find(
        (piece) => piece.id === laterDeadCapture.capturedPieceId,
      ),
    );
    expect(
      selectRequiredWoundEvents(ledger).some(
        (event) => event.pieceId === 'b-r-a8',
      ),
    ).toBe(
      laterDeadRoll <
        woundProbability(
          laterDeadCapture.pieceType,
          laterDeadCapture.capturedPieceType!,
        ),
    );
    expect(
      deterministicWoundRoll(ledger, ledger.events[0]),
    ).toBeGreaterThanOrEqual(0);
    expect(deterministicWoundRoll(ledger, ledger.events[0])).toBeLessThan(1);
  });

  it('returns exactly the successful seeded rolls without a minimum', () => {
    const expected = ledger.events
      .filter(
        (event) =>
          deterministicWoundRoll(
            ledger,
            event,
            ledger.pieces.find((piece) => piece.id === event.pieceId),
            ledger.pieces.find((piece) => piece.id === event.capturedPieceId),
          ) < woundProbability(event.pieceType, event.capturedPieceType!),
      )
      .map((event) => `${event.pieceId}:${event.ply}`);

    expect(
      selectRequiredWoundEvents(ledger).map(
        (event) => `${event.pieceId}:${event.inflictedAtPly}`,
      ),
    ).toEqual(expected);
  });

  it('selects a stable explicit cause for every planned wound', () => {
    const selected = selectRequiredWoundEvents(ledger);
    for (const wound of selected) {
      const event = ledger.events[wound.inflictedAtPly - 1];
      expect(wound.causeType).toBe(selectWoundCause(ledger, event));
      expect(wound.sourcePieceId).toBe(
        wound.causeType === 'victim-retaliation' ? wound.capturedPieceId : null,
      );
    }
  });
});

function piece(
  id: string,
  permanentName: string,
): GameLedger['pieces'][number] {
  return { id, permanentName } as GameLedger['pieces'][number];
}

function capture(
  ply: number,
  pieceId: string,
  pieceType: FantasyPieceType,
  capturedPieceId: string,
  capturedPieceType: FantasyPieceType,
): GameLedger['events'][number] {
  return {
    ply,
    san: `capture-${ply}`,
    pieceId,
    pieceType,
    capturedPieceId,
    capturedPieceType,
    isCapture: true,
    isCheck: false,
    isCheckmate: false,
  } as GameLedger['events'][number];
}
