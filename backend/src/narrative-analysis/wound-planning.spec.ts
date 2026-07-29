import type { GameLedger } from '../chess/models/game-ledger';
import { selectRequiredWoundEvents } from './wound-planning';

describe('selectRequiredWoundEvents', () => {
  const ledger = {
    survivors: ['w-q-d1', 'w-r-a1'],
    events: [
      capture(1, 'w-q-d1', 'b-p-a7', 'grunt'),
      capture(2, 'w-q-d1', 'b-q-d8', 'queen'),
      capture(3, 'w-r-a1', 'b-n-b8', 'knight-commander'),
      capture(4, 'b-r-a8', 'w-p-a2', 'grunt'),
    ],
  } as GameLedger;

  it('selects two important captures by different surviving attackers', () => {
    expect(selectRequiredWoundEvents(ledger)).toEqual([
      {
        pieceId: 'w-q-d1',
        inflictedAtPly: 2,
        capturedPieceId: 'b-q-d8',
        capturedPieceType: 'queen',
      },
      {
        pieceId: 'w-r-a1',
        inflictedAtPly: 3,
        capturedPieceId: 'b-n-b8',
        capturedPieceType: 'knight-commander',
      },
    ]);
  });

  it('never selects a capture made by an attacker who later dies', () => {
    expect(
      selectRequiredWoundEvents(ledger).some(
        (event) => event.pieceId === 'b-r-a8',
      ),
    ).toBe(false);
  });

  it('returns the maximum available when fewer than two captures qualify', () => {
    const shortLedger = {
      ...ledger,
      survivors: ['w-q-d1'],
      events: [ledger.events[0]],
    } as GameLedger;

    expect(selectRequiredWoundEvents(shortLedger)).toHaveLength(1);
  });
});

function capture(
  ply: number,
  pieceId: string,
  capturedPieceId: string,
  capturedPieceType: GameLedger['events'][number]['capturedPieceType'],
): GameLedger['events'][number] {
  return {
    ply,
    pieceId,
    capturedPieceId,
    capturedPieceType,
    isCapture: true,
    isCheck: false,
    isCheckmate: false,
  } as GameLedger['events'][number];
}
