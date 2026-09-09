import { DeterministicStoryValidator } from './deterministic-story.validator';
import type { GameLedger } from '../chess/models/game-ledger';

describe('premature named severance', () => {
  const validator = new DeterministicStoryValidator();
  const ledger = {
    pieces: [
      { id: 'knight', permanentName: 'Southern Knight Commander', characterName: 'Gwendolyn', fantasyType: 'knight-commander' },
      { id: 'queen', permanentName: 'Northern Queen', characterName: 'Fiora', fantasyType: 'queen' },
    ],
    events: [],
  } as unknown as GameLedger;
  const wounds = [{ pieceId: 'knight', inflictedAtPly: 32, woundCatalogId: 'severed-hand', injury: 'One hand is permanently severed during direct combat.', lastingEffects: ['Permanent limb loss'], recoveryPly: null }];
  const check = (fantasyNarration: string, ply = 30) => validator.validateTimedWounds(
    [{ ply, fantasyNarration, characters: ['knight', 'queen'] }], wounds, ledger, false,
  );

  it('routes the saved two-character failure to targeted wound repair', () => {
    const prose = "Fiora's last spell-signals snapped across the clash and severed one of Gwendolyn's hands at the wrist.";
    expect(check(prose)).toContainEqual(expect.objectContaining({ type: 'wound-continuity', severity: 'error', pieceId: 'knight', ply: 30, excerpt: prose }));
  });

  it('accepts the same event at its planned ply', () => {
    // Use a non-commander fixture to isolate timing from weapon checks.
    const timedLedger = { ...ledger, pieces: ledger.pieces.map(p => ({ ...p, fantasyType: 'grunt' })) } as GameLedger;
    expect(validator.validateTimedWounds([{ ply: 32, fantasyNarration: "Fiora severed Gwendolyn's hand.", characters: ['knight'] }], wounds, timedLedger, false)).toEqual([]);
  });

  it('recognizes passive voice and curly apostrophes', () => {
    expect(check('Gwendolyn’s hand was severed by Fiora.')).toContainEqual(expect.objectContaining({ severity: 'error', pieceId: 'knight' }));
  });

  it.each([
    "Gwendolyn severed Fiora's hand.",
    "Fiora nearly severed Gwendolyn's hand.",
    "Fiora could have severed Gwendolyn's hand.",
    "Fiora did not sever Gwendolyn's hand.",
    "Fiora feared that she had severed Gwendolyn's hand.",
    "Fiora severed Gwendolyn's hand strap.",
  ])('does not block uncertain events or another victim: %s', prose => {
    expect(check(prose).filter(f => f.severity === 'error')).toEqual([]);
  });
});
