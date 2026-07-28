import { PgnApiService } from './pgn-api.service';
import { PgnViewerComponent } from './pgn-viewer.component';
import type { ParsedPgn } from './pgn.models';

describe('PgnViewerComponent character inspection', () => {
  let component: PgnViewerComponent;

  beforeEach(() => {
    component = new PgnViewerComponent({} as PgnApiService);
    component.game = game;
  });

  it('puts White at the top by default and flips on request', () => {
    expect(component.boardOrientation).toBe('black');

    component.flipBoard();

    expect(component.boardOrientation).toBe('white');
  });

  it('tracks a stable pawn identity across moves and counts only past kills', () => {
    component.currentPly = 1;
    component.inspectPieceAt('e4');

    expect(component.inspectedPiece?.permanentName).toBe('Mara');
    expect(component.pieceRole(component.inspectedPiece!)).toBe('Field Medic');
    expect(component.inspectedPieceKills).toBe(0);

    component.currentPly = 3;
    component.inspectPieceAt('d5');

    expect(component.inspectedPiece?.id).toBe('w-p-e2');
    expect(component.inspectedPieceKills).toBe(1);
  });

  it('does not expose a captured character on its former square', () => {
    component.currentPly = 3;
    component.inspectPieceAt('d5');
    expect(component.inspectedPiece?.id).toBe('w-p-e2');

    component.inspectPieceAt('d7');
    expect(component.inspectedPiece).toBeNull();
  });

  it('does not reveal a pawn promotion before its promotion ply', () => {
    component.currentPly = 3;
    component.inspectPieceAt('d5');

    expect(component.pieceRole(component.inspectedPiece!)).toBe('Field Medic');
    expect(component.pieceDescription(component.inspectedPiece!)).not.toContain(
      'transformed',
    );

    component.currentPly = 4;
    component.inspectPieceAt('d6');

    expect(component.pieceRole(component.inspectedPiece!)).toBe(
      'Ascended Moving Fortress',
    );
    expect(component.pieceDescription(component.inspectedPiece!)).toContain(
      'transformed',
    );
  });

  it('lists fallen pieces with their killers without revealing future losses', () => {
    component.currentPly = 2;

    expect(component.darkKingdomFallen).toEqual([]);

    component.currentPly = 3;

    expect(component.darkKingdomFallen).toEqual([
      {
        victim: jasmine.objectContaining({
          id: 'b-p-d7',
          permanentName: 'Nessa',
        }),
        killer: jasmine.objectContaining({
          id: 'w-p-e2',
          permanentName: 'Mara',
        }),
        ply: 3,
      },
    ]);
    expect(component.lightKingdomFallen).toEqual([]);
  });

  it('opens and closes the Hall of the Fallen', () => {
    component.toggleFallenRoster();
    expect(component.fallenRosterOpen).toBeTrue();

    component.closeFallenRoster();
    expect(component.fallenRosterOpen).toBeFalse();
  });

  it('presents the epilogue as a final playback page', () => {
    component.epilogue =
      'The surviving kingdoms counted the cost. The banners lowered. The healers crossed the field. Dawn found them still working. No herald named it peace.';
    component.currentPly = game.positions.length;

    expect(component.canGoForward).toBeTrue();

    component.forward();

    expect(component.isEpiloguePage).toBeTrue();
    expect(component.currentMoveLabel).toBe('Epilogue');
    expect(component.currentStory).toBe(component.epilogue);
    expect(component.epilogueParagraphs).toEqual([
      'The surviving kingdoms counted the cost. The banners lowered.',
      'The healers crossed the field. Dawn found them still working.',
      'No herald named it peace.',
    ]);
    expect(component.currentFen).toBe(game.ledger.finalFen);
    expect(component.canGoForward).toBeFalse();

    component.back();

    expect(component.currentPly).toBe(game.positions.length);
    expect(component.isEpiloguePage).toBeFalse();
  });
});

const game: ParsedPgn = {
  headers: { Result: '*' },
  startFen: '8/3p4/8/8/8/8/4P3/8 w - - 0 1',
  positions: [
    {
      ply: 1,
      san: 'e4',
      fen: '8/3p4/8/8/4P3/8/8/8 b - - 0 1',
      color: 'w',
      piece: 'p',
      from: 'e2',
      to: 'e4',
      isCapture: false,
      isCheck: false,
      isCheckmate: false,
      isCastle: false,
      nearbyEnemies: [],
      targetedEnemies: [],
    },
    {
      ply: 2,
      san: 'd5',
      fen: '8/8/8/3p4/4P3/8/8/8 w - - 0 2',
      color: 'b',
      piece: 'p',
      from: 'd7',
      to: 'd5',
      isCapture: false,
      isCheck: false,
      isCheckmate: false,
      isCastle: false,
      nearbyEnemies: [],
      targetedEnemies: [],
    },
    {
      ply: 3,
      san: 'exd5',
      fen: '8/8/8/3P4/8/8/8/8 b - - 0 2',
      color: 'w',
      piece: 'p',
      from: 'e4',
      to: 'd5',
      captured: 'p',
      isCapture: true,
      isCheck: false,
      isCheckmate: false,
      isCastle: false,
      nearbyEnemies: [],
      targetedEnemies: [],
    },
  ],
  realms: { white: 'Light Kingdom', black: 'Dark Kingdom' },
  ledger: {
    metadata: { result: '*' },
    initialFen: '8/3p4/8/8/8/8/4P3/8 w - - 0 1',
    finalFen: '8/8/8/3P4/8/8/8/8 b - - 0 2',
    pieces: [
      {
        id: 'w-p-e2',
        chessColor: 'w',
        side: 'north',
        originalSquare: 'e2',
        chessType: 'p',
        currentChessType: 'r',
        fantasyType: 'moving-fortress',
        permanentName: 'Mara',
        companyName: 'Northern Ember Company',
        viewpointName: 'Mara',
        viewpointRole: 'field medic',
        alive: true,
      },
      {
        id: 'b-p-d7',
        chessColor: 'b',
        side: 'south',
        originalSquare: 'd7',
        chessType: 'p',
        currentChessType: 'p',
        fantasyType: 'grunt',
        permanentName: 'Nessa',
        companyName: 'Southern Iron Company',
        viewpointName: 'Nessa',
        viewpointRole: 'sergeant',
        alive: false,
        capturedAtPly: 3,
      },
    ],
    events: [
      event(1, 'north', 'e2', 'e4', 'w-p-e2'),
      event(2, 'south', 'd7', 'd5', 'b-p-d7'),
      {
        ...event(3, 'north', 'e4', 'd5', 'w-p-e2'),
        isCapture: true,
        capturedPieceId: 'b-p-d7',
        capturedPieceType: 'grunt',
      },
      {
        ...event(4, 'north', 'd5', 'd6', 'w-p-e2'),
        isPromotion: true,
        promotionType: 'moving-fortress',
        isQuietMove: false,
      },
    ],
    survivors: ['w-p-e2'],
    capturedPieces: ['b-p-d7'],
    promotedPieces: [],
  },
};

function event(
  ply: number,
  side: 'north' | 'south',
  from: string,
  to: string,
  pieceId: string,
): ParsedPgn['ledger']['events'][number] {
  return {
    ply,
    moveNumber: Math.ceil(ply / 2),
    side,
    san: '',
    from,
    to,
    pieceId,
    pieceType: 'grunt',
    isCapture: false,
    isCheck: false,
    isCheckmate: false,
    isCastle: false,
    isPromotion: false,
    isEnPassant: false,
    isQuietMove: true,
    boardFenAfterMove: '',
  };
}
