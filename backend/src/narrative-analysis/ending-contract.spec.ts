import { GameLedgerService } from '../chess/game-ledger.service';
import { PieceIdentityService } from '../chess/piece-identity.service';
import { PgnService } from '../pgn/pgn.service';
import { buildEndingContract } from './ending-contract';

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
    expect(
      typeof contract.creativeDirection.laterChronicleCliffhanger,
    ).toBe('boolean');
    expect(buildEndingContract(ledger).creativeDirection).toEqual(
      contract.creativeDirection,
    );
  });
});
