import {
  BATTLE_TEMPERAMENTS,
  battleTemperament,
} from './battle-characterization';
import type { BattleDisposition, GameLedger } from './models/game-ledger';
import { normalizePawnViewpoints } from './piece-identity.service';

describe('disposition-compatible characterization', () => {
  it('gives every supported disposition varied deterministic options', () => {
    expect(Object.keys(BATTLE_TEMPERAMENTS)).toHaveLength(10);
    for (const disposition of Object.keys(
      BATTLE_TEMPERAMENTS,
    ) as BattleDisposition[]) {
      const choices = BATTLE_TEMPERAMENTS[disposition];
      expect(new Set(choices).size).toBeGreaterThanOrEqual(2);
      const samples = Array.from({ length: 30 }, (_, i) =>
        battleTemperament(disposition, `seed-${i}`),
      );
      expect(new Set(samples).size).toBeGreaterThanOrEqual(2);
      expect(samples.every((s) => choices.includes(s))).toBe(true);
      expect(battleTemperament(disposition, 'same')).toBe(
        battleTemperament(disposition, 'same'),
      );
    }
  });
  it('preserves an existing saved backstory and disposition', () => {
    const ledger = {
      initialFen: 'fixture',
      pieces: [
        {
          id: 'w-p-f2',
          chessType: 'p',
          side: 'north',
          originalSquare: 'f2',
          permanentName: 'Ivor',
          viewpointName: 'Ivor',
          viewpointRole: 'field medic',
          battleDisposition: 'ruthless',
          deathDisposition: 'fearful',
          backstory: 'An existing published history.',
        },
      ],
    } as unknown as GameLedger;
    expect(normalizePawnViewpoints(ledger).pieces[0]).toMatchObject({
      backstory: 'An existing published history.',
      battleDisposition: 'ruthless',
      deathDisposition: 'fearful',
    });
  });
  it('uses the assigned disposition in newly created fallback backstories', () => {
    for (const chessType of ['p', 'q', 'b', 'n', 'r'] as const) {
      const ledger = {
        initialFen: 'fixture',
        pieces: [
          {
            id: `w-${chessType}-b1`,
            chessType,
            side: 'north',
            originalSquare: 'b1',
            permanentName: 'Nessa',
            characterName: 'Nessa',
            pronouns: 'she/her',
            viewpointRole: chessType === 'p' ? 'field medic' : undefined,
            battleDisposition: 'sadistic',
          },
        ],
      } as unknown as GameLedger;
      const story = normalizePawnViewpoints(ledger).pieces[0].backstory!;
      expect(story).toMatch(/She is (delighted by an opponent|pleased by humiliating)/);
      expect(story).not.toMatch(/\bThey\b/);
    }
  });
});
