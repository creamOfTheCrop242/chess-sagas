import { BadRequestException } from '@nestjs/common';
import { GameLedgerService } from '../chess/game-ledger.service';
import {
  normalizePawnViewpoints,
  PieceIdentityService,
} from '../chess/piece-identity.service';
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
    const viewpointPawn = game.ledger.pieces.find(
      (piece) => piece.id === 'w-p-e2',
    )!;
    expect(viewpointPawn).toMatchObject({
      permanentName: expect.any(String),
      viewpointName: expect.any(String),
      viewpointRole: expect.any(String),
      companyName: 'Northern Ember Company',
      backstory: expect.stringContaining(viewpointPawn.permanentName),
    });
    expect(viewpointPawn.permanentName).toBe(viewpointPawn.viewpointName);
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
      permanentName: expect.any(String),
      viewpointName: expect.any(String),
      viewpointRole: expect.any(String),
      companyName: 'Northern Dawn Company',
      promotedFromPawnId: 'w-p-a7',
      alive: true,
    });
    expect(pawn?.permanentName).toBe(pawn?.viewpointName);
    expect(game.ledger.promotedPieces).toEqual(['w-p-a7']);
  });

  it('assigns unique pawn names deterministically for each game', () => {
    const pgn =
      '[White "Ada"]\n[Black "Turing"]\n[Date "2026.07.27"]\n[Result "*"]\n\n1. e4 e5 *';
    const firstNames = service
      .parse(pgn)
      .ledger.pieces.filter((piece) => piece.chessType === 'p')
      .map((piece) => piece.viewpointName);
    const repeatedNames = service
      .parse(pgn)
      .ledger.pieces.filter((piece) => piece.chessType === 'p')
      .map((piece) => piece.viewpointName);
    const differentGameNames = service
      .parse(pgn.replace('1. e4 e5', '1. d4 d5'))
      .ledger.pieces.filter((piece) => piece.chessType === 'p')
      .map((piece) => piece.viewpointName);

    expect(repeatedNames).toEqual(firstNames);
    expect(new Set(firstNames).size).toBe(firstNames.length);
    expect(differentGameNames).not.toEqual(firstNames);
  });

  it('assigns balanced pawn roles deterministically for each game', () => {
    const pgn =
      '[White "Ada"]\n[Black "Turing"]\n[Date "2026.07.27"]\n[Result "*"]\n\n1. e4 e5 *';
    const roles = (gamePgn: string, side: 'north' | 'south') =>
      service
        .parse(gamePgn)
        .ledger.pieces.filter(
          (piece) => piece.chessType === 'p' && piece.side === side,
        )
        .sort((left, right) =>
          left.originalSquare.localeCompare(right.originalSquare),
        )
        .map((piece) => piece.viewpointRole);
    const expectedRoles = [
      'company captain',
      'company captain',
      'field medic',
      'scout',
      'sergeant',
      'shield-bearer',
      'spearman',
      'standard-bearer',
    ];

    const northRoles = roles(pgn, 'north');
    const southRoles = roles(pgn, 'south');

    expect(roles(pgn, 'north')).toEqual(northRoles);
    expect(roles(pgn, 'south')).toEqual(southRoles);
    expect([...northRoles].sort()).toEqual(expectedRoles);
    expect([...southRoles].sort()).toEqual(expectedRoles);
    expect(roles(pgn.replace('1. e4 e5', '1. d4 d5'), 'north')).not.toEqual(
      northRoles,
    );
  });

  it('preserves pawn roles already stored in an existing ledger', () => {
    const ledger = service.parse('[Result "*"]\n\n1. e4 e5 *').ledger;
    const pawn = ledger.pieces.find((piece) => piece.id === 'w-p-e2')!;
    pawn.viewpointRole = 'royal cartographer';

    const normalized = normalizePawnViewpoints(ledger);

    expect(
      normalized.pieces.find((piece) => piece.id === pawn.id)?.viewpointRole,
    ).toBe('royal cartographer');
  });

  it('assigns a permanent soldier-operator to every Moving Fortress', () => {
    const pgn = '[Result "*"]\n\n1. e4 e5 *';
    const ledger = service.parse(pgn).ledger;
    const fortresses = ledger.pieces.filter((piece) => piece.chessType === 'r');
    const allSoldierNames = ledger.pieces.flatMap((piece) => [
      ...(piece.viewpointName ? [piece.viewpointName] : []),
      ...(piece.operatorName ? [piece.operatorName] : []),
    ]);
    const repeatedOperators = service
      .parse(pgn)
      .ledger.pieces.filter((piece) => piece.chessType === 'r')
      .map((piece) => piece.operatorName);
    const differentOperators = service
      .parse('[Result "*"]\n\n1. d4 d5 *')
      .ledger.pieces.filter((piece) => piece.chessType === 'r')
      .map((piece) => piece.operatorName);

    expect(fortresses).toHaveLength(4);
    expect(fortresses.every((piece) => Boolean(piece.operatorName))).toBe(true);
    expect(new Set(fortresses.map((piece) => piece.operatorName)).size).toBe(4);
    expect(new Set(allSoldierNames).size).toBe(allSoldierNames.length);
    expect(repeatedOperators).toEqual(
      fortresses.map((piece) => piece.operatorName),
    );
    expect(differentOperators).not.toEqual(repeatedOperators);
    expect(
      fortresses.every(
        (piece) =>
          piece.backstory?.includes(piece.operatorName!) &&
          piece.backstory.includes('cannot survive apart'),
      ),
    ).toBe(true);
  });

  it('assigns deterministic personal histories that vary between games', () => {
    const pgn =
      '[White "Ada"]\n[Black "Turing"]\n[Date "2026.08.06"]\n[Result "*"]\n\n1. e4 e5 *';
    const histories = (gamePgn: string) =>
      service.parse(gamePgn).ledger.pieces.map((piece) => piece.backstory);

    expect(histories(pgn)).toEqual(histories(pgn));
    expect(histories(pgn.replace('1. e4 e5', '1. d4 d5'))).not.toEqual(
      histories(pgn),
    );
    expect(histories(pgn).every(Boolean)).toBe(true);
  });

  it('assigns binary character pronouns and avoids singular they in personal backstories', () => {
    const pieces = service.parse('[Result "*"]\n\n1. e4 e5 *').ledger.pieces;
    const individuallyNarrated = pieces.filter((piece) =>
      ['p', 'r', 'b', 'n'].includes(piece.chessType),
    );

    expect(
      pieces.every((piece) => ['he/him', 'she/her'].includes(piece.pronouns!)),
    ).toBe(true);
    for (const piece of individuallyNarrated) {
      expect(piece.backstory).not.toMatch(
        /\b(?:they|them|their|themselves)\b/i,
      );
      expect(piece.backstory).toMatch(
        piece.pronouns === 'she/her'
          ? /\b(?:she|her)\b/i
          : /\b(?:he|him|his)\b/i,
      );
    }
  });

  it('composes broad backstory variety across different battle records', () => {
    const ledgers = Array.from(
      { length: 12 },
      (_, index) =>
        service.parse(
          `[White "Ada"]\n[Black "Turing"]\n[Date "2026.08.${String(index + 1).padStart(2, '0')}"]\n[Result "*"]\n\n1. e4 e5 *`,
        ).ledger,
    );
    const types = [
      'grunt',
      'moving-fortress',
      'knight-commander',
      'archwizard',
      'queen',
      'king',
    ] as const;

    for (const type of types) {
      const histories = ledgers.flatMap((ledger) =>
        ledger.pieces
          .filter((piece) => piece.fantasyType === type)
          .map((piece) => piece.backstory),
      );
      expect(new Set(histories).size).toBeGreaterThan(histories.length / 2);
    }
  });

  it('preserves the established lore inside composed elite backstories', () => {
    const pieces = service.parse('[Result "*"]\n\n1. e4 e5 *').ledger.pieces;
    const story = (type: (typeof pieces)[number]['fantasyType']) =>
      pieces.find((piece) => piece.fantasyType === type)?.backstory ?? '';

    expect(story('king')).toContain('Royal Seal');
    expect(story('queen')).toContain('fortress-grade armor');
    expect(story('archwizard')).toContain('Teleportation');
    expect(story('moving-fortress')).toContain('cannot survive apart');
    expect(story('knight-commander')).toContain('striking forces');
  });

  it('reverses east and west for commanders, Archwizards, and Fortresses', () => {
    const parsed = service.parse(
      '[White "Ada"]\n[Black "Turing"]\n[Result "*"]\n\n1. e4 *',
    );
    const names = new Map(
      parsed.ledger.pieces.map((piece) => [
        piece.originalSquare,
        piece.permanentName,
      ]),
    );

    expect(names.get('a1')).toBe('Northeast Fortress');
    expect(names.get('b1')).toBe('Northeast Knight Commander');
    expect(names.get('c1')).toBe('Northeast Archwizard');
    expect(names.get('f1')).toBe('Northwest Archwizard');
    expect(names.get('g1')).toBe('Northwest Knight Commander');
    expect(names.get('h1')).toBe('Northwest Fortress');
    expect(names.get('a8')).toBe('Southeast Fortress');
    expect(names.get('h8')).toBe('Southwest Fortress');
  });

  it('marks checks and checkmate and derives termination', () => {
    const game = service.parse('[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
    const mate = game.ledger.events.at(-1)!;

    expect(mate).toMatchObject({ isCheck: true, isCheckmate: true });
    expect(game.ledger.metadata).toMatchObject({
      result: '0-1',
      termination: 'checkmate',
    });
    expect(mate.checkmateExplanation).toMatchObject({
      kingId: 'w-k-e1',
      kingSquare: 'e1',
      checkingPieceIds: ['b-q-d8'],
      checkingSquares: ['h4'],
      canCaptureCheckingPiece: false,
      canBlockCheck: false,
      legalResponseCount: 0,
    });
  });

  it('records why a nearby protected checking piece cannot be captured', () => {
    const game = service.parse(
      '[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0',
    );
    const explanation = game.ledger.events.at(-1)?.checkmateExplanation;

    expect(explanation).toMatchObject({
      kingId: 'b-k-e8',
      kingSquare: 'e8',
      checkingPieceIds: ['w-q-d1'],
      checkingSquares: ['f7'],
      checkingPieces: [
        {
          pieceId: 'w-q-d1',
          square: 'f7',
          kingCanReach: true,
          protectedByPieceIds: expect.arrayContaining(['w-b-f1']),
        },
      ],
      canCaptureCheckingPiece: false,
      canBlockCheck: false,
      legalResponseCount: 0,
    });
  });

  it('infers resignation from a decisive result in a playable position', () => {
    const game = service.parse('[Result "0-1"]\n\n1. e4 e5 0-1');

    expect(game.ledger.events.at(-1)?.isCheckmate).toBe(false);
    expect(game.ledger.metadata).toMatchObject({
      result: '0-1',
      termination: 'resignation',
    });
  });

  it('does not override an explicit timeout with inferred resignation', () => {
    const game = service.parse(
      '[Result "0-1"]\n[Termination "White lost on time"]\n\n1. e4 e5 0-1',
    );

    expect(game.ledger.metadata.termination).toBe('timeout');
  });

  it('rejects empty PGN input', () => {
    expect(() => service.parse('')).toThrow(BadRequestException);
  });
});
