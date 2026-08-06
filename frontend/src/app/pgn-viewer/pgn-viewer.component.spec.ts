import { PgnApiService } from './pgn-api.service';
import { PgnViewerComponent } from './pgn-viewer.component';
import type { ParsedPgn } from './pgn.models';
import { of } from 'rxjs';

describe('PgnViewerComponent character inspection', () => {
  let component: PgnViewerComponent;

  beforeEach(() => {
    component = new PgnViewerComponent({} as PgnApiService);
    component.game = structuredClone(game);
  });

  it('puts White at the top by default and flips on request', () => {
    expect(component.boardOrientation).toBe('black');

    component.flipBoard();

    expect(component.boardOrientation).toBe('white');
  });

  it('keeps a tapped piece pinned instead of letting stale hover override it', () => {
    component.currentPly = 2;
    component.inspectPieceAt('d5');
    expect(component.hoveredPieceId).toBe('b-p-d7');

    component.selectPieceAt('e4');

    expect(component.hoveredPieceId).toBeNull();
    expect(component.selectedPieceId).toBe('w-p-e2');
    expect(component.inspectedPiece?.id).toBe('w-p-e2');

    component.inspectPieceAt('d5');
    expect(component.inspectedPiece?.id).toBe('w-p-e2');
  });

  it('keeps repeated taps open and lets the close action fully dismiss the card', () => {
    component.currentPly = 1;

    component.selectPieceAt('e4');
    component.selectPieceAt('e4');
    expect(component.selectedPieceId).toBe('w-p-e2');

    component.hoveredPieceId = 'b-p-d7';
    component.clearSelectedPiece();
    expect(component.selectedPieceId).toBeNull();
    expect(component.hoveredPieceId).toBeNull();
    expect(component.inspectedPiece).toBeNull();
  });

  it('highlights only the acting piece on a move beat', () => {
    expect(component.currentBeatSquare).toBeNull();

    component.currentPly = 1;
    expect(component.currentBeatSquare).toBe('e4');

    component.epilogue = 'The surviving kingdoms counted the cost.';
    component.currentPly = component.game!.positions.length + 1;
    expect(component.currentBeatSquare).toBeNull();
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

  it('reveals a lasting injury only when its infliction beat is reached', () => {
    component.wounds = [
      {
        pieceId: 'w-p-e2',
        inflictedAtPly: 3,
        injury: 'Her left hand is severed.',
        lastingEffects: ['She must work and fight one-handed.'],
        recoveryPly: null,
      },
    ];
    component.currentPly = 2;
    component.inspectPieceAt('e4');

    expect(component.inspectedPieceStatus.label).toBe('Unharmed');

    component.currentPly = 3;
    component.inspectPieceAt('d5');

    expect(component.inspectedPieceStatus).toEqual({
      label: 'Maimed',
      detail: 'Her left hand is severed. · She must work and fight one-handed.',
      tone: 'maimed',
    });
  });

  it('accumulates deterministic strain each time a king is checked', () => {
    const southernKing = {
      id: 'b-k-e8',
      chessColor: 'b' as const,
      side: 'south' as const,
      originalSquare: 'e8',
      chessType: 'k' as const,
      currentChessType: 'k' as const,
      fantasyType: 'king' as const,
      permanentName: 'Southern King',
      alive: true,
    };
    component.game!.ledger.pieces.push(southernKing);
    component.game!.ledger.events[0].isCheck = true;
    component.game!.ledger.events[2].isCheck = true;
    component.game!.ledger.events[3].isCheck = true;

    component.currentPly = 1;
    expect(component.pieceStatus(southernKing).label).toBe('Strained');

    component.currentPly = 4;
    expect(component.pieceStatus(southernKing)).toEqual({
      label: 'Wounded',
      detail:
        "3 direct threats have damaged the King's wards and strained his connection to the Royal Seal.",
      tone: 'wounded',
    });
    component.selectedPieceId = southernKing.id;
    expect(component.inspectedPieceWoundHistory).toHaveSize(3);
    expect(component.inspectedPieceWoundHistory[0].inflictedAtPly).toBe(4);
  });

  it('hides cross-character names and piece IDs in malformed wound status data', () => {
    component.wounds = [
      {
        pieceId: 'w-p-e2',
        inflictedAtPly: 3,
        injury: "Nessa's spell burns Mara while w-b-c1 collapses.",
        lastingEffects: [
          'Her left hand remains partially numb.',
          'Nessa watches the scar worsen.',
        ],
        recoveryPly: null,
      },
    ];
    component.currentPly = 3;
    component.inspectPieceAt('d5');

    expect(component.inspectedPieceStatus.detail).toBe(
      'Injured during the capture at beat 3. · Her left hand remains partially numb.',
    );
    expect(component.inspectedPieceStatus.detail).not.toContain('Nessa');
    expect(component.inspectedPieceStatus.detail).not.toContain('w-b-c1');
  });

  it('shows a recovered wound as scarred and a captured character as dead', () => {
    component.wounds = [
      {
        pieceId: 'w-p-e2',
        inflictedAtPly: 3,
        injury: 'Her ribs are broken.',
        lastingEffects: ['Breathing remains painful.'],
        recoveryPly: 4,
      },
    ];
    component.currentPly = 4;
    component.inspectPieceAt('d6');

    expect(component.inspectedPieceStatus.label).toBe('Scarred');

    component.hoveredPieceId = null;
    component.selectedPieceId = 'b-p-d7';

    expect(component.inspectedPieceStatus).toEqual({
      label: 'Dead',
      detail: 'Fell at beat 3.',
      tone: 'dead',
    });
  });

  it('marks the defeated King dead when the checkmate beat is reached', () => {
    component.game!.headers['Result'] = '1-0';
    component.game!.ledger.metadata['result'] = '1-0';
    component.game!.ledger.metadata['termination'] = 'checkmate';
    component.game!.ledger.pieces.push({
      id: 'b-k-e8',
      chessColor: 'b',
      side: 'south',
      originalSquare: 'e8',
      chessType: 'k',
      currentChessType: 'k',
      fantasyType: 'king',
      permanentName: 'Southern King',
      alive: true,
    });
    component.game!.ledger.events[2].isCheckmate = true;
    component.selectedPieceId = 'b-k-e8';

    component.currentPly = 2;
    expect(component.inspectedPieceStatus.label).toBe('Unharmed');

    component.currentPly = 3;
    component.defeatedKingDeathDescription =
      'The Queen’s spell shattered his heart as the Royal Seal collapsed.';
    expect(component.inspectedPieceStatus).toEqual({
      label: 'Dead',
      detail:
        'The Queen’s spell shattered his heart as the Royal Seal collapsed.',
      tone: 'dead',
    });
  });

  it('accumulates active wounds while retaining recovered scars', () => {
    component.wounds = [
      {
        pieceId: 'w-p-e2',
        inflictedAtPly: 1,
        injury: 'Her shoulder is cut.',
        lastingEffects: ['A pale scar crosses the joint.'],
        recoveryPly: 3,
      },
      {
        pieceId: 'w-p-e2',
        inflictedAtPly: 3,
        injury: 'Her ribs are broken.',
        lastingEffects: ['Breathing remains painful.'],
        recoveryPly: null,
      },
      {
        pieceId: 'w-p-e2',
        inflictedAtPly: 4,
        injury: 'Her left hand is severed.',
        lastingEffects: ['She must fight one-handed.'],
        recoveryPly: null,
      },
    ];
    component.currentPly = 4;
    component.inspectPieceAt('d6');

    expect(component.inspectedPieceStatus).toEqual({
      label: 'Maimed',
      detail: '2 active injuries · 1 healed scar',
      tone: 'maimed',
    });
    expect(component.inspectedPieceWoundHistory).toEqual([
      jasmine.objectContaining({
        inflictedAtPly: 4,
        state: 'active',
      }),
      jasmine.objectContaining({
        inflictedAtPly: 3,
        state: 'active',
      }),
      jasmine.objectContaining({
        inflictedAtPly: 1,
        state: 'recovered',
        recoveryPly: 3,
      }),
    ]);
  });

  it('shows the defeated realm’s surviving Fortress entombment threat', () => {
    component.game!.ledger.metadata['result'] = '0-1';
    component.game!.ledger.metadata['termination'] = 'checkmate';
    component.epilogue = 'The Light Kingdom’s stored magic began to fade.';
    component.currentPly = component.game!.positions.length + 1;
    component.selectedPieceId = 'w-p-e2';

    expect(component.inspectedPieceStatus.label).toBe('Entombment Threat');
    expect(component.inspectedPieceStatus.tone).toBe('entombed');
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

  it('lists every character in the Warhost Ledger with current health', () => {
    component.currentPly = 2;

    expect(component.lightKingdomRoster).toHaveSize(1);
    expect(component.darkKingdomRoster).toHaveSize(1);
    expect(component.pieceStatus(component.darkKingdomRoster[0]).label).toBe(
      'Unharmed',
    );

    component.currentPly = 3;

    expect(component.pieceStatus(component.darkKingdomRoster[0]).label).toBe(
      'Dead',
    );
  });

  it('uses a character backstory in the board inspector and roster', () => {
    const piece = component.game!.ledger.pieces[0];
    piece.backstory = 'Mara enlisted after defending her village ward.';

    expect(component.pieceDescription(piece)).toBe(piece.backstory);
    component.toggleRosterPiece(piece);
    expect(component.rosterPieceId).toBe(piece.id);
    component.toggleRosterPiece(piece);
    expect(component.rosterPieceId).toBeNull();
  });

  it('reveals a fallen character fate only after the death beat', () => {
    const victim = component.darkKingdomRoster[0];
    component.scenes = [
      {
        id: 'scene-3',
        actNumber: 1,
        sceneNumber: 3,
        startPly: 3,
        endPly: 3,
        involvedMoves: ['exd5'],
        fantasyNarration:
          'Mara broke through the shield wall, and Nessa fell defending her company standard.',
        chessExplanation: 'The white pawn captures the black pawn.',
        characters: ['w-p-e2', 'b-p-d7'],
        locations: [],
        deaths: ['b-p-d7'],
        captureActorId: 'w-p-e2',
        captureVictimId: 'b-p-d7',
        promotions: [],
        visualPrompt: '',
        videoPrompt: '',
        estimatedDurationSeconds: 8,
        continuityNotes: [],
      },
    ];
    component.currentPly = 2;
    expect(component.pieceFate(victim)).toBeNull();

    component.currentPly = 3;
    expect(component.pieceFate(victim)).toEqual({
      killerName: 'Mara',
      beat: 3,
      account:
        'Mara broke through the shield wall, and Nessa fell defending her company standard.',
      finalCondition: null,
    });
  });

  it('presents the epilogue as a final playback page', () => {
    component.epilogue =
      'The surviving kingdoms counted the cost. The banners lowered. The healers crossed the field. Dawn found them still working. No herald named it peace.';
    component.laterEpilogueHeading = 'Nine Winters Later';
    component.laterEpilogue =
      'A traveler crossed the nameless field. Beneath the mud, a dying ward answered his lantern.';
    component.currentPly = game.positions.length;

    expect(component.canGoForward).toBeTrue();

    component.forward();

    expect(component.isAftermathPage).toBeTrue();
    expect(component.isEpiloguePage).toBeTrue();
    expect(component.currentMoveLabel).toBe('Immediate Aftermath');
    expect(component.currentStory).toBe(component.epilogue);
    expect(component.epilogueParagraphs).toEqual([
      'The surviving kingdoms counted the cost. The banners lowered.',
      'The healers crossed the field. Dawn found them still working.',
      'No herald named it peace.',
    ]);
    expect(component.laterEpilogueParagraphs).toEqual([
      'A traveler crossed the nameless field. Beneath the mud, a dying ward answered his lantern.',
    ]);
    expect(component.currentFen).toBe(game.ledger.finalFen);
    expect(component.canGoForward).toBeTrue();

    component.forward();

    expect(component.isAftermathPage).toBeFalse();
    expect(component.isLaterChroniclePage).toBeTrue();
    expect(component.currentMoveLabel).toBe('Later Chronicles');
    expect(component.currentStory).toBe(component.laterEpilogue);
    expect(component.canGoForward).toBeFalse();

    component.back();

    expect(component.isAftermathPage).toBeTrue();
    expect(component.isLaterChroniclePage).toBeFalse();

    component.back();

    expect(component.currentPly).toBe(game.positions.length);
    expect(component.isEpiloguePage).toBeFalse();
  });

  it('uses saved identities instead of transient parse identities', () => {
    const parsed = structuredClone(game);
    parsed.ledger.pieces[0].permanentName = 'Transient Mara';
    const savedLedger = structuredClone(game.ledger);
    savedLedger.pieces[0].permanentName = 'Saved Mara';
    const api = {
      parse: () => of(parsed),
      createGame: () => of({ id: 'saved-game', ledger: { data: savedLedger } }),
    } as unknown as PgnApiService;
    const submitted = new PgnViewerComponent(api);
    submitted.pgnText = '1. e4 d5 2. exd5';

    submitted.submit();

    expect(submitted.gameId).toBe('saved-game');
    expect(submitted.game?.ledger.pieces[0].permanentName).toBe('Saved Mara');
  });

  it('uses the archived saved ledger when replaying a Hall record', () => {
    const parsed = structuredClone(game);
    parsed.ledger.pieces[0].permanentName = 'Transient Mara';
    const savedLedger = structuredClone(game.ledger);
    savedLedger.pieces[0].permanentName = 'Archived Mara';
    const api = {
      getRecord: () =>
        of({
          id: 'record-1',
          rawPgn: '1. e4 d5 2. exd5',
          whitePlayer: 'Ada',
          blackPlayer: 'Turing',
          result: '1-0',
          createdAt: '2026-08-01',
          completedAt: '2026-08-01',
          ledger: { data: savedLedger },
          sceneBreakdown: { data: { scenes: [] } },
        }),
      parse: () => of(parsed),
    } as unknown as PgnApiService;
    const route = {
      snapshot: { paramMap: { get: () => 'record-1' } },
    } as never;
    const replay = new PgnViewerComponent(api, route);

    replay.ngOnInit();

    expect(replay.recordReplay).toBeTrue();
    expect(replay.game?.ledger.pieces[0].permanentName).toBe('Archived Mara');
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
