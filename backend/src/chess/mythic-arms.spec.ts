import { GameLedgerService } from './game-ledger.service';
import { PieceIdentityService } from './piece-identity.service';
import { PgnService } from '../pgn/pgn.service';
import { mythicArmForCommander } from './mythic-arms';

describe('Mythic Arm ownership', () => {
  it('assigns each starting Knight Commander a distinct structured weapon', () => {
    const ledger = new PgnService(
      new GameLedgerService(new PieceIdentityService()),
    ).parse(
      '[White "Ada"]\n[Black "Turing"]\n[Result "*"]\n\n1. e4 e5 *',
    ).ledger;
    const commanders = ledger.pieces.filter(
      (piece) => piece.fantasyType === 'knight-commander',
    );

    expect(commanders).toHaveLength(4);
    expect(commanders.every((piece) => piece.mythicArm)).toBe(true);
    expect(new Set(commanders.map((piece) => piece.mythicArm?.id)).size).toBe(
      4,
    );
    for (const commander of commanders) {
      expect(commander.backstory).toContain(commander.mythicArm?.description);
    }
  });

  it('recovers structured ownership from a legacy registry backstory', () => {
    const arm = mythicArmForCommander(
      {
        originalSquare: 'g8',
        backstory:
          'Brienne wields a stormbound great hammer whose impacts release concussive thunder.',
      },
      'a different seed must not override persisted canon',
    );

    expect(arm.id).toBe('stormbound-great-hammer');
  });
});
