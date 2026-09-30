import { GameLedgerService } from '../chess/game-ledger.service';
import { PieceIdentityService } from '../chess/piece-identity.service';
import { PgnService } from '../pgn/pgn.service';
import { buildEndingContract } from './ending-contract';
import { selectEndingGenre } from './ending-contract';
import type { EndingGenre } from './ending-contract';

describe('buildEndingContract', () => {
  const pgn = new PgnService(new GameLedgerService(new PieceIdentityService()));

  it('keeps a decisive game ending in check distinct from checkmate', () => {
    const ledger = pgn.parse(`[Date "2026.08.07"]
[White "soniklm123"]
[Black "BigRei1997"]
[Result "0-1"]

1. g3 Nf6 2. d4 g6 3. Bg2 Bg7 4. e4 d6 5. e5 dxe5 6. dxe5 Qxd1+ 7. Kxd1 Ng4 8. Nf3 Nxf2+ 9. Ke1 Nxh1 10. Bxh1 Nc6 11. Nc3 Nxe5 12. Nxe5 Bxe5 13. Nd5 Bf5 14. Nxc7+ Bxc7 15. Bxb7 Rb8 16. Bc6+ Bd7 17. Bxd7+ Kxd7 18. c3 e5 19. b4 a5 20. a4 axb4 21. cxb4 Rxb4 22. Ba3 Rxa4 23. Rd1+ Ke6 24. Bb2 Ba5+ 0-1`).ledger;

    const contract = buildEndingContract(ledger);
    expect(contract).toMatchObject({
      result: '0-1',
      winner: 'south',
      loser: 'north',
      termination: 'resignation',
      finalMove: 'Ba5+',
      finalPositionIsCheck: true,
      finalPositionIsCheckmate: false,
      resigningSide: 'north',
    });
    expect(contract.creativeDirection.aftermathFocus).toBeTruthy();
    expect(contract.creativeDirection.laterChronicleLens).toBeTruthy();
    expect(contract.creativeDirection.endingGenre).toBeTruthy();
    expect(typeof contract.creativeDirection.laterChronicleCliffhanger).toBe(
      'boolean',
    );
    expect(contract.creativeDirection.destroyedSealConsequence).toBeTruthy();
    expect(contract.creativeDirection.intactSealConsequence).toBeTruthy();
    expect(buildEndingContract(ledger).creativeDirection).toEqual(
      contract.creativeDirection,
    );
  });

  it('selects ending genres with deterministic weighted boundaries', () => {
    expect(selectEndingGenre(0)).toBe('magical-catastrophe');
    expect(selectEndingGenre(19)).toBe('magical-catastrophe');
    expect(selectEndingGenre(20)).toBe('supernatural-horror');
    expect(selectEndingGenre(54)).toBe('personal-tragedy');
    expect(selectEndingGenre(94)).toBe('political-horror');
    expect(selectEndingGenre(99)).toBe('uneasy-survival');
    expect(selectEndingGenre(100)).toBe('magical-catastrophe');
  });

  it('selects a destroyed-Seal consequence for checkmate', () => {
    const ledger = pgn.parse('1. f3 e5 2. g4 Qh4# 0-1').ledger;
    const contract = buildEndingContract(ledger);

    expect(contract.termination).toBe('checkmate');
    expect(contract.creativeDirection.destroyedSealConsequence).toBeTruthy();
  });

  it('keeps non-political genres out of political aftermath focuses', () => {
    const politicalFocuses = new Set([
      'political-succession-and-accountability',
      'occupation-and-the-victors-burden',
    ]);

    for (let index = 0; index < 250; index += 1) {
      const ledger = pgn.parse(
        `[Date "2026.08.${String((index % 28) + 1).padStart(2, '0')}"]\n[White "North${index}"]\n[Black "South${index}"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1`,
      ).ledger;
      const direction = buildEndingContract(ledger).creativeDirection;
      expect(direction.destroyedSealConsequence).not.toBe(
        'civilian-third-power-rising-against-both-crowns',
      );
      expect(direction.intactSealConsequence).not.toBe(
        'civilian-third-power-rising-against-both-crowns',
      );

      if (
        direction.endingGenre !== 'political-horror' &&
        direction.endingGenre !== 'rebellion'
      ) {
        expect(politicalFocuses.has(direction.aftermathFocus)).toBe(false);
      }
    }
  });

  it('keeps newly selected endings centered on established characters', () => {
    const legacyCivilianLenses = new Set([
      'a-descendant-inheriting-an-unwanted-legacy',
      'a-historian-disputing-the-official-account',
      'a-settlement-built-over-the-battlefield',
      'a-pilgrim-visiting-a-contested-memorial',
      'craftspeople-repurposing-weapons-and-relics',
      'a-folk-tradition-distorting-the-battles-memory',
      'a-scavenger-misunderstanding-a-dangerous-discovery',
    ]);

    for (let index = 0; index < 500; index += 1) {
      const ledger = pgn.parse(
        `[Date "2026.09.${String((index % 28) + 1).padStart(2, '0')}"]\n[White "NamedNorth${index}"]\n[Black "NamedSouth${index}"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1`,
      ).ledger;
      const direction = buildEndingContract(ledger).creativeDirection;

      expect(direction.aftermathFocus).not.toBe(
        'civilian-survival-and-reconstruction',
      );
      expect(legacyCivilianLenses.has(direction.laterChronicleLens)).toBe(
        false,
      );
      expect(direction.intactSealConsequence).not.toBe(
        'children-inheriting-memories-from-other-fractured-realities',
      );
    }
  });

  it('selects consequences compatible with representative genres', () => {
    const allowed: Partial<Record<EndingGenre, Set<string>>> = {
      'magical-catastrophe': new Set([
        'realm-magic-detonation-threatening-both-kingdoms',
        'devouring-void-consuming-the-defeated-capital',
        'reality-fracture-scattering-survivors-across-worlds',
        'time-wound-trapping-the-battlefield-in-repeating-moments',
        'magical-contamination-transforming-land-and-survivors',
      ]),
      rebellion: new Set([
        'surviving-character-leading-an-uprising-against-the-victor',
        'civilian-third-power-rising-against-both-crowns',
      ]),
    };

    for (let index = 0; index < 500; index += 1) {
      const ledger = pgn.parse(
        `[White "GenreNorth${index}"]\n[Black "GenreSouth${index}"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1`,
      ).ledger;
      const direction = buildEndingContract(ledger).creativeDirection;
      const genreAllowed = allowed[direction.endingGenre];

      if (genreAllowed) {
        expect(genreAllowed.has(direction.destroyedSealConsequence)).toBe(true);
      }
    }
  });
});
