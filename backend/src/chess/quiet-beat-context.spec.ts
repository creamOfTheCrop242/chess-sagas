import { GameLedgerService } from './game-ledger.service';
import { PieceIdentityService } from './piece-identity.service';
import type { ChessEvent } from './models/game-ledger';

function event(ply: number, overrides: Partial<ChessEvent> = {}): ChessEvent {
  return {
    ply,
    moveNumber: Math.ceil(ply / 2),
    side: 'north',
    san: 'a3',
    from: 'a2',
    to: 'a3',
    pieceId: 'actor',
    pieceType: 'grunt',
    isCapture: false,
    isCheck: false,
    isCheckmate: false,
    isCastle: false,
    isPromotion: false,
    isEnPassant: false,
    isQuietMove: true,
    boardFenAfterMove: '',
    ...overrides,
  };
}

describe('quiet beat relevance', () => {
  const service = new GameLedgerService({} as PieceIdentityService);
  const assign = (events: ChessEvent[]) => {
    service['assignQuietBeatContexts'](events, 'fixture');
    return events;
  };
  const capture = (overrides: Partial<ChessEvent> = {}) =>
    event(1, {
      isQuietMove: false,
      isCapture: true,
      capturedPieceId: 'victim',
      ...overrides,
    });

  it('does not tie an unrelated mover to a nearby capture', () => {
    const events = assign([capture({ pieceId: 'stranger' }), event(2)]);
    expect(events[1].quietBeatContext?.relatedEventPly).toBeUndefined();
    expect(events[1].quietBeatContext?.purpose).not.toBe('aftermath-reaction');
  });
  it('prioritizes a capture the mover witnessed', () => {
    const events = assign([
      capture({
        pieceId: 'stranger',
        interactionContext: {
          adjacentAllyPieceIds: [],
          avengesDeaths: [],
          witnessedCapture: {
            victimPieceId: 'victim',
            killerPieceId: 'stranger',
            witnessPieceIds: ['actor'],
          },
        },
      }),
      event(2),
    ]);
    expect(events[1].quietBeatContext).toMatchObject({
      purpose: 'aftermath-reaction',
      relatedEventPly: 1,
      focusPieceIds: ['actor'],
    });
  });
  it('links the checked king but not an unrelated friendly pawn', () => {
    const check = event(1, {
      pieceId: 'enemy',
      side: 'south',
      isCheck: true,
      isQuietMove: false,
    });
    expect(
      assign([check, event(2, { pieceType: 'king' })])[1].quietBeatContext
        ?.relatedEventPly,
    ).toBe(1);
    expect(
      assign([check, event(2)])[1].quietBeatContext?.relatedEventPly,
    ).toBeUndefined();
  });
  it('does not grant knowledge from witnessing a future capture', () => {
    const upcoming = capture({
      ply: 3,
      pieceId: 'stranger',
      interactionContext: {
        adjacentAllyPieceIds: [],
        avengesDeaths: [],
        witnessedCapture: {
          victimPieceId: 'victim',
          killerPieceId: 'stranger',
          witnessPieceIds: ['actor'],
        },
      },
    });
    expect(
      assign([event(2), upcoming])[0].quietBeatContext?.relatedEventPly,
    ).toBeUndefined();
  });
  it('is repeatable and preserves factual event fields', () => {
    const input = [capture(), event(2), event(3), event(4)];
    const first = assign(structuredClone(input));
    expect(assign(structuredClone(input))).toEqual(first);
    expect(
      first.map(({ quietBeatContext: _context, ...facts }) => facts),
    ).toEqual(input);
    expect(first[2].quietBeatContext?.purpose).not.toBe(
      first[1].quietBeatContext?.purpose,
    );
  });
});
