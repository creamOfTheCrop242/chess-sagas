import type { GameLedger } from '../chess/models/game-ledger';
import { archiveBattleTitle, isSpoilerFreeBattleTitle } from './story-title';

describe('story titles', () => {
  it.each([
    'The Seal-Breaking Checkmate',
    'A Draw at the Seal-Line',
    'The Fortress at H8',
    'The Seal at b6',
  ])('rejects archive spoilers and board notation: %s', (title) => {
    expect(isSpoilerFreeBattleTitle(title)).toBe(false);
  });

  it.each([
    'The Siphoned Seals',
    'The Battle of the Ashen Road',
    'The Battle of the Soldier and the Iron Queen',
  ])('accepts spoiler-free battle names: %s', (title) => {
    expect(isSpoilerFreeBattleTitle(title)).toBe(true);
  });

  it('names a remarkable non-final underdog capture without revealing the ending', () => {
    const ledger = {
      pieces: [
        { id: 'soldier', fantasyType: 'grunt' },
        { id: 'queen', fantasyType: 'queen' },
      ],
      events: [
        {
          ply: 1,
          pieceId: 'soldier',
          pieceType: 'grunt',
          isCapture: true,
          capturedPieceId: 'queen',
          capturedPieceType: 'queen',
        },
        { ply: 2, pieceId: 'king', pieceType: 'king', isCapture: false },
      ],
    } as GameLedger;

    expect(archiveBattleTitle('The Queen at D4', ledger, 'game-1')).toBe(
      'The Battle of the Soldier and the Iron Queen',
    );
  });

  it('uses a stable fantasy battle name when no unusual capture exists', () => {
    const title = archiveBattleTitle(
      'The Seal-Breaking Checkmate',
      null,
      'game-1',
    );
    expect(title).toMatch(/^The (Battle|Clash|War) /);
    expect(archiveBattleTitle('Checkmate', null, 'game-1')).toBe(title);
  });
});
