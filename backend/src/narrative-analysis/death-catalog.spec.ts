import type { FantasyPieceType } from '../chess/models/game-ledger';
import {
  DEATH_CATALOG,
  DEATH_EVENT_KINDS,
  DEATH_METHODS,
  DEATH_TARGET_AREAS,
  deathCatalogEntry,
  eligibleDeathCatalogEntries,
  selectDeathCatalogEntry,
} from './death-catalog';

describe('death catalog', () => {
  it('has unique IDs and controlled values', () => {
    expect(new Set(DEATH_CATALOG.map((entry) => entry.id)).size).toBe(
      DEATH_CATALOG.length,
    );
    for (const entry of DEATH_CATALOG) {
      expect(entry.eventKinds.length).toBeGreaterThan(0);
      for (const eventKind of entry.eventKinds) {
        expect(DEATH_EVENT_KINDS).toContain(eventKind);
      }
      expect(DEATH_METHODS).toContain(entry.method);
      expect(DEATH_TARGET_AREAS).toContain(entry.targetArea);
      expect(entry.victimTypes.length).toBeGreaterThan(0);
      expect(entry.narrationGuidance.trim()).not.toBe('');
      expect(entry.forbiddenClaims.length).toBeGreaterThan(0);
    }
  });

  it('provides capture deaths for every non-King victim and killer type', () => {
    const victims: FantasyPieceType[] = [
      'queen',
      'archwizard',
      'moving-fortress',
      'knight-commander',
      'grunt',
    ];
    const killers: FantasyPieceType[] = [
      'king',
      'queen',
      'archwizard',
      'moving-fortress',
      'knight-commander',
      'grunt',
    ];
    for (const victim of victims) {
      for (const killer of killers) {
        expect(
          eligibleDeathCatalogEntries(victim, 'capture', killer).length,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('requires every Fortress capture death to kill the embedded pilot', () => {
    const fortressDeaths = eligibleDeathCatalogEntries(
      'moving-fortress',
      'capture',
    );
    expect(fortressDeaths.length).toBeGreaterThanOrEqual(4);
    expect(
      fortressDeaths.every(
        (entry) =>
          entry.narrationGuidance.includes('pilot') &&
          entry.forbiddenClaims.some((claim) => claim.includes('pilot')),
      ),
    ).toBe(true);
  });

  it('keeps checkmate and surrender deaths separate from captures', () => {
    expect(eligibleDeathCatalogEntries('king', 'capture')).toEqual([]);
    const checkmateDeaths = eligibleDeathCatalogEntries('king', 'checkmate');
    expect(checkmateDeaths.length).toBeGreaterThanOrEqual(5);
    expect(
      checkmateDeaths.every((entry) => entry.targetArea !== 'royal-seal-bond'),
    ).toBe(true);
    expect(
      eligibleDeathCatalogEntries('king', 'accepted-surrender').length,
    ).toBeGreaterThan(0);
  });

  it('provides a physical checkmate death for every checking piece type', () => {
    const checkingTypes: FantasyPieceType[] = [
      'king',
      'queen',
      'archwizard',
      'moving-fortress',
      'knight-commander',
      'grunt',
    ];

    for (const checkingType of checkingTypes) {
      const options = eligibleDeathCatalogEntries(
        'king',
        'checkmate',
        checkingType,
      );
      expect(options.length).toBeGreaterThan(0);
      expect(
        options.every((entry) => entry.targetArea !== 'royal-seal-bond'),
      ).toBe(true);
    }
  });

  it('looks up entries by stable ID', () => {
    expect(deathCatalogEntry('fortress-command-cradle-destroyed')).toEqual(
      expect.objectContaining({
        targetArea: 'fortress-command-cradle',
        decisiveActorRequired: true,
      }),
    );
    expect(deathCatalogEntry('not-a-death')).toBeUndefined();
  });

  it('selects the same compatible death contract for the same seed', () => {
    const first = selectDeathCatalogEntry(
      'king',
      'checkmate',
      'queen',
      'game|57|queen|king',
    );
    const second = selectDeathCatalogEntry(
      'king',
      'checkmate',
      'queen',
      'game|57|queen|king',
    );
    expect(second.id).toBe(first.id);
    expect(first.victimTypes).toContain('king');
    expect(first.killerTypes).toContain('queen');
    expect(first.targetArea).not.toBe('royal-seal-bond');
  });
});
