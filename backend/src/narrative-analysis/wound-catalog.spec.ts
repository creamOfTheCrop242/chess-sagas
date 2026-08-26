import type { FantasyPieceType } from '../chess/models/game-ledger';
import {
  eligibleWoundCatalogEntries,
  WOUND_BODY_AREAS,
  WOUND_CATALOG,
  WOUND_EFFECTS,
  WOUND_SEVERITIES,
  woundCatalogEntry,
} from './wound-catalog';
import { WOUND_CAUSE_TYPES } from './wound-planning';

describe('wound catalog', () => {
  it('has unique stable IDs and valid controlled values', () => {
    expect(new Set(WOUND_CATALOG.map((entry) => entry.id)).size).toBe(
      WOUND_CATALOG.length,
    );
    for (const entry of WOUND_CATALOG) {
      expect(WOUND_SEVERITIES).toContain(entry.severity);
      expect(WOUND_BODY_AREAS).toContain(entry.bodyArea);
      expect(entry.effects.length).toBeGreaterThan(0);
      for (const effect of entry.effects)
        expect(WOUND_EFFECTS).toContain(effect);
      expect(entry.ownerTypes.length).toBeGreaterThan(0);
      expect(entry.causeTypes.length).toBeGreaterThan(0);
      expect(entry.narrationGuidance.trim()).not.toBe('');
    }
  });

  it('covers every owner type and deterministic wound cause', () => {
    const ownerTypes: FantasyPieceType[] = [
      'king',
      'queen',
      'archwizard',
      'moving-fortress',
      'knight-commander',
      'grunt',
    ];
    for (const ownerType of ownerTypes) {
      for (const causeType of WOUND_CAUSE_TYPES) {
        expect(
          eligibleWoundCatalogEntries(ownerType, causeType).length,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('keeps Fortress wounds machine-and-pilot specific', () => {
    const fortressEntries = WOUND_CATALOG.filter((entry) =>
      entry.ownerTypes.includes('moving-fortress'),
    );
    expect(fortressEntries.length).toBeGreaterThanOrEqual(7);
    expect(
      fortressEntries.every(
        (entry) =>
          entry.bodyArea.startsWith('fortress-') &&
          entry.effects.includes('pilot-trauma'),
      ),
    ).toBe(true);
  });

  it('looks up a catalog entry by stable ID', () => {
    expect(woundCatalogEntry('abdominal-puncture')).toEqual(
      expect.objectContaining({
        severity: 'severe',
        bodyArea: 'abdomen',
      }),
    );
    expect(woundCatalogEntry('not-a-wound')).toBeUndefined();
  });

  it('uses arrow wounds only when an archer causes the retaliation', () => {
    const archerEntries = eligibleWoundCatalogEntries(
      'queen',
      'victim-retaliation',
      'archer',
    );
    expect(archerEntries.map((entry) => entry.id).sort()).toEqual([
      'arrow-in-leg',
      'arrow-through-shoulder',
    ]);

    const ordinaryEntries = eligibleWoundCatalogEntries(
      'queen',
      'victim-retaliation',
      'spearman',
    );
    expect(ordinaryEntries.some((entry) => entry.id.startsWith('arrow-'))).toBe(
      false,
    );
  });
});
