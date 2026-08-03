import { GameLedgerService } from './game-ledger.service';
import { PieceIdentityService } from './piece-identity.service';
import { PgnService } from '../pgn/pgn.service';
import { selectBattlefieldEnvironment } from './battlefield-environment';

describe('selectBattlefieldEnvironment', () => {
  const pgn = new PgnService(new GameLedgerService(new PieceIdentityService()));

  it('selects a stable environment from the complete game', () => {
    const ledger = pgn.parse(
      '[White "Ada"]\n[Black "Turing"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
    ).ledger;

    expect(selectBattlefieldEnvironment(ledger)).toEqual(
      selectBattlefieldEnvironment(ledger),
    );
    expect(selectBattlefieldEnvironment(ledger).name.length).toBeGreaterThan(0);
  });

  it('can select different environments for different battle records', () => {
    const first = pgn.parse(
      '[White "Ada"]\n[Black "Turing"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
    ).ledger;
    const second = pgn.parse(
      '[White "Lovelace"]\n[Black "Hopper"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
    ).ledger;

    expect(selectBattlefieldEnvironment(first).id).not.toBe(
      selectBattlefieldEnvironment(second).id,
    );
  });
});
