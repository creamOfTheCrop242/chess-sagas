import { BadRequestException } from '@nestjs/common';
import { GameLedgerService } from '../chess/game-ledger.service';
import { PieceIdentityService } from '../chess/piece-identity.service';
import { PgnService } from './pgn.service';

describe('PgnService deterministic ledger', () => {
  let service: PgnService;

  beforeEach(() => {
    const identities = new PieceIdentityService();
    service = new PgnService(new GameLedgerService(identities));
  });

  it('tracks stable captor and victim identities and survivors', () => {
    const game = service.parse(
      '[White "Ada"]\n[Black "Turing"]\n[Result "*"]\n\n1. e4 d5 2. exd5 *',
    );
    const capture = game.ledger.events[2];

    expect(capture).toMatchObject({
      pieceId: 'w-p-e2',
      capturedPieceId: 'b-p-d7',
      isCapture: true,
    });
    expect(game.ledger.capturedPieces).toEqual(['b-p-d7']);
    expect(game.ledger.survivors).toContain('w-p-e2');
    expect(
      game.ledger.pieces.find((piece) => piece.id === 'w-p-e2'),
    ).toMatchObject({
      permanentName: 'Jake',
      viewpointName: 'Jake',
      companyName: 'Northern Ember Company',
    });
    expect(game.ledger.finalFen).toBe(capture.boardFenAfterMove);
    expect(game.ledger.metadata).toMatchObject({
      whitePlayer: 'Ada',
      blackPlayer: 'Turing',
      result: '*',
    });
  });

  it('tracks king-side castling and relocates the stable rook identity', () => {
    const game = service.parse('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O *');
    const castle = game.ledger.events.at(-1)!;

    expect(castle).toMatchObject({
      pieceId: 'w-k-e1',
      isCastle: true,
      castleSide: 'king',
    });
    expect(game.ledger.survivors).toContain('w-r-h1');
  });

  it('tracks an en-passant capture on the victim pawn square', () => {
    const game = service.parse('1. e4 a6 2. e5 d5 3. exd6 *');
    const capture = game.ledger.events.at(-1)!;

    expect(capture).toMatchObject({
      pieceId: 'w-p-e2',
      capturedPieceId: 'b-p-d7',
      isCapture: true,
      isEnPassant: true,
    });
  });

  it('preserves the source pawn identity through promotion', () => {
    const game = service.parse(
      '[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n[Result "*"]\n\n1. a8=Q+ *',
    );
    const promotion = game.ledger.events[0];
    const pawn = game.ledger.pieces.find((piece) => piece.id === 'w-p-a7');

    expect(promotion).toMatchObject({
      pieceId: 'w-p-a7',
      isPromotion: true,
      promotionType: 'queen',
      isCheck: true,
    });
    expect(pawn).toMatchObject({
      chessType: 'p',
      currentChessType: 'q',
      permanentName: 'Rowan',
      viewpointName: 'Rowan',
      companyName: 'Northern Dawn Company',
      promotedFromPawnId: 'w-p-a7',
      alive: true,
    });
    expect(game.ledger.promotedPieces).toEqual(['w-p-a7']);
  });

  it('marks checks and checkmate and derives termination', () => {
    const game = service.parse('[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
    const mate = game.ledger.events.at(-1)!;

    expect(mate).toMatchObject({ isCheck: true, isCheckmate: true });
    expect(game.ledger.metadata).toMatchObject({
      result: '0-1',
      termination: 'checkmate',
    });
  });

  it('rejects empty PGN input', () => {
    expect(() => service.parse('')).toThrow(BadRequestException);
  });
});
