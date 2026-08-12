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

  it('records when a move blocks an existing check', () => {
    const game = service.parse(
      '[SetUp "1"]\n[FEN "4r2k/8/8/8/8/8/3B4/4K3 w - - 0 1"]\n[Result "*"]\n\n1. Be3 *',
    );

    expect(game.ledger.events[0].tacticalContext).toMatchObject({
      checkResponse: 'blocks-check',
    });
  });

  it('records forks and pieces attacking the mover on its destination', () => {
    const game = service.parse(
      '[SetUp "1"]\n[FEN "k7/8/8/4r2b/7r/8/3N4/K7 w - - 0 1"]\n[Result "*"]\n\n1. Nf3 *',
    );
    const tactics = game.ledger.events[0].tacticalContext;

    expect(tactics?.forkedPieceIds).toEqual(['b-r-e5', 'b-r-h4']);
    expect(tactics?.attacksPieceIds).toEqual(['b-r-e5', 'b-r-h4']);
    expect(tactics?.attackedByPieceIds).toContain('b-b-h5');
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
    const requiredRoles = ['company captain', 'field medic'];
    const expandedRoles = new Set([
      ...requiredRoles,
      'scout',
      'shield-bearer',
      'spearman',
      'standard-bearer',
      'sergeant',
      'archer',
      'sapper',
      'outrider',
      'quartermaster',
      'signaler',
      'skirmisher',
      'siege engineer',
      'mage acolyte',
      'queen candidate',
    ]);

    const northRoles = roles(pgn, 'north');
    const southRoles = roles(pgn, 'south');

    expect(roles(pgn, 'north')).toEqual(northRoles);
    expect(roles(pgn, 'south')).toEqual(southRoles);
    for (const sideRoles of [northRoles, southRoles]) {
      expect(sideRoles).toHaveLength(8);
      expect(new Set(sideRoles).size).toBe(8);
      expect(sideRoles.every((role) => expandedRoles.has(role!))).toBe(true);
      requiredRoles.forEach((role) => expect(sideRoles).toContain(role));
    }
    expect(
      [...northRoles, ...southRoles].some((role) =>
        [
          'archer',
          'sapper',
          'outrider',
          'quartermaster',
          'signaler',
          'skirmisher',
          'siege engineer',
          'mage acolyte',
          'queen candidate',
        ].includes(role!),
      ),
    ).toBe(true);
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

  it('assigns every queen candidate a feminine identity and varied candidate canon', () => {
    const feminineNames = new Set([
      'Aveline',
      'Brienne',
      'Catrin',
      'Elara',
      'Elowen',
      'Fiora',
      'Gwendolyn',
      'Isolde',
      'Jessamine',
      'Kerra',
      'Lyra',
      'Maela',
      'Mara',
      'Mirelle',
      'Nerys',
      'Nessa',
      'Odette',
      'Rhiannon',
      'Sabine',
      'Sera',
      'Tamsin',
      'Veyra',
      'Wren',
      'Ysolde',
      'Zara',
    ]);
    const candidates = Array.from({ length: 48 }, (_, index) =>
      service
        .parse(
          `[White "Ada"]\n[Black "Turing"]\n[Date "2026.09.${String(index + 1).padStart(2, '0')}"]\n[Result "*"]\n\n1. e4 e5 *`,
        )
        .ledger.pieces.filter(
          (piece) => piece.viewpointRole === 'queen candidate',
        ),
    ).flat();

    expect(candidates.length).toBeGreaterThan(8);
    expect(
      candidates.every(
        (piece) =>
          feminineNames.has(piece.permanentName) &&
          piece.pronouns === 'she/her' &&
          /\b(?:she|her)\b/i.test(piece.backstory ?? '') &&
          /Queen/.test(piece.backstory ?? ''),
      ),
    ).toBe(true);
    expect(
      new Set(candidates.map((piece) => piece.backstory)).size,
    ).toBeGreaterThan(8);
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
    expect(story('knight-commander')).toContain('most elite captains');
    expect(story('knight-commander')).toContain('Queen');
    expect(story('knight-commander')).toContain('magic-powered weapon');
  });

  it('gives every Queen a persistent and varied combat discipline', () => {
    const queens = Array.from({ length: 24 }, (_, index) =>
      service
        .parse(
          `[White "Ada"]\n[Black "Turing"]\n[Date "2027.01.${String(index + 1).padStart(2, '0')}"]\n[Result "*"]\n\n1. e4 e5 *`,
        )
        .ledger.pieces.filter((piece) => piece.fantasyType === 'queen'),
    ).flat();
    const discipline =
      /combat discipline is (arcane dueling|defensive guardianship|aggressive battlemagic|battlefield control|tactical command)/;

    expect(queens.every((piece) => discipline.test(piece.backstory ?? ''))).toBe(
      true,
    );
    expect(
      new Set(
        queens.map((piece) => piece.backstory?.match(discipline)?.[1]),
      ).size,
    ).toBe(5);
  });

  it('gives Knight Commanders varied augmentation histories and signature heavy weapons', () => {
    const commanders = Array.from({ length: 24 }, (_, index) =>
      service
        .parse(
          `[White "Ada"]\n[Black "Turing"]\n[Date "2026.10.${String(index + 1).padStart(2, '0')}\"]\n[Result "*"]\n\n1. e4 e5 *`,
        )
        .ledger.pieces.filter(
          (piece) => piece.fantasyType === 'knight-commander',
        ),
    ).flat();

    expect(
      commanders.every(
        (piece) =>
          /most elite captains/.test(piece.backstory ?? '') &&
          /nowhere near the Queen/.test(piece.backstory ?? '') &&
          /magic-powered weapon/.test(piece.backstory ?? '') &&
          /(?:great hammer|greatsword|mace|maul|poleaxe|war flail|glaive|war axe)/.test(
            piece.backstory ?? '',
          ),
      ),
    ).toBe(true);
    expect(
      new Set(
        commanders.map(
          (piece) =>
            piece.backstory?.match(
              /(?:stormbound great hammer|Seal-forged greatsword|gravity mace|rune-headed maul|ward-breaking poleaxe|chain-linked war flail|crescent glaive|two-handed war axe)/,
            )?.[0],
        ),
      ).size,
    ).toBeGreaterThan(5);
  });

  it('gives Archwizards varied paths to magical mastery', () => {
    const archwizards = Array.from({ length: 24 }, (_, index) =>
      service
        .parse(
          `[White "Ada"]\n[Black "Turing"]\n[Date "2026.11.${String(index + 1).padStart(2, '0')}\"]\n[Result "*"]\n\n1. e4 e5 *`,
        )
        .ledger.pieces.filter((piece) => piece.fantasyType === 'archwizard'),
    ).flat();
    const histories = archwizards.map((piece) => piece.backstory ?? '');

    expect(histories.every((story) => story.includes('Teleportation'))).toBe(
      true,
    );
    expect(histories.some((story) => story.includes('royal colleges'))).toBe(
      true,
    );
    expect(
      histories.some((story) =>
        /reclusive master|private apprenticeship|many teachers/.test(story),
      ),
    ).toBe(true);
    expect(
      histories.some((story) =>
        /natural ability|No academy|independent practice/.test(story),
      ),
    ).toBe(true);
    expect(new Set(histories).size).toBeGreaterThan(histories.length / 2);
  });

  it('gives Moving Fortresses varied magic-round weapons and attachments', () => {
    const fortresses = Array.from({ length: 24 }, (_, index) =>
      service
        .parse(
          `[White "Ada"]\n[Black "Turing"]\n[Date "2026.12.${String(index + 1).padStart(2, '0')}\"]\n[Result "*"]\n\n1. e4 e5 *`,
        )
        .ledger.pieces.filter(
          (piece) => piece.fantasyType === 'moving-fortress',
        ),
    ).flat();
    const histories = fortresses.map((piece) => piece.backstory ?? '');
    const weapons = histories.map(
      (story) =>
        story.match(
          /(?:heavy cannon|rotary gatling gun|twin long-barreled cannons|siege bombard|repeating ward-rifles|breach cannon|broadside batteries|rotating storm-caster)/,
        )?.[0],
    );
    const attachments = histories.map(
      (story) =>
        story.match(
          /(?:crushing prow|siege drill|stabilizer claws|shield generator|bridge frame|smoke projectors|recovery winch|observation mast|blade wheels|ward-siphon array)/,
        )?.[0],
    );

    expect(histories.every((story) => story.includes('devastating ram'))).toBe(
      true,
    );
    expect(new Set(weapons).size).toBeGreaterThan(5);
    expect(new Set(attachments).size).toBeGreaterThan(7);
  });

  it('makes Kings ageless conduits with varied ruling dispositions', () => {
    const kings = Array.from({ length: 24 }, (_, index) =>
      service
        .parse(
          `[White "Ada"]\n[Black "Turing"]\n[Date "2027.01.${String(index + 1).padStart(2, '0')}\"]\n[Result "*"]\n\n1. e4 e5 *`,
        )
        .ledger.pieces.filter((piece) => piece.fantasyType === 'king'),
    ).flat();
    const histories = kings.map((piece) => piece.backstory ?? '');

    expect(
      histories.every(
        (story) =>
          story.includes('halted his aging') && story.includes('ageless'),
      ),
    ).toBe(true);
    expect(
      histories.some((story) =>
        /measured mercy|patient ruler|honorable surrender/.test(story),
      ),
    ).toBe(true);
    expect(
      histories.some((story) =>
        /rejects surrender|public execution|authoritarian/.test(story),
      ),
    ).toBe(true);
    expect(new Set(histories).size).toBeGreaterThan(histories.length / 2);
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
