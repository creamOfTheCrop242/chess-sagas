import { GameLedgerService } from './game-ledger.service';
import { PieceIdentityService } from './piece-identity.service';
import { PgnService } from '../pgn/pgn.service';
import { allowedSurrenderFates, classifySurrender } from './surrender-context';

describe('surrender context', () => {
  const pgn = new PgnService(new GameLedgerService(new PieceIdentityService()));

  it('classifies an unsupported early resignation as premature', () => {
    const ledger = pgn.parse(
      '[White "Ada"]\n[Black "Turing"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
    ).ledger;

    expect(classifySurrender(ledger)).toMatchObject({
      judgment: 'premature',
      materialBalance: 0,
      inCheck: false,
      allowedFates: allowedSurrenderFates('premature'),
    });
  });

  it('does not classify checkmate as surrender', () => {
    const ledger = pgn.parse(
      '[White "Ada"]\n[Black "Turing"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
    ).ledger;

    expect(classifySurrender(ledger)).toBeNull();
  });

  it('keeps rejected surrender out of necessary outcomes', () => {
    expect(allowedSurrenderFates('necessary')).not.toContain(
      'executed-after-rejected-surrender',
    );
    expect(allowedSurrenderFates('premature')).toContain(
      'executed-after-rejected-surrender',
    );
  });
});
