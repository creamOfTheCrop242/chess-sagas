import {
  attackCapabilities,
  deathMechanismCompatible,
  establishedMythicArm,
  fortressLoadout,
  FORTRESS_PRIMARY_WEAPONS,
  FORTRESS_ATTACHMENTS,
  woundMechanismCompatible,
} from './equipment-capabilities';
import { MYTHIC_ARMS } from './mythic-arms';
import type { FantasyPieceType, PieceIdentity } from './models/game-ledger';
import {
  eligibleWoundCatalogEntries,
  type WoundCatalogId,
} from '../narrative-analysis/wound-catalog';
import { selectDeathCatalogEntry } from '../narrative-analysis/death-catalog';

const piece = (role: FantasyPieceType, fields: Partial<PieceIdentity> = {}) =>
  ({ fantasyType: role, ...fields }) as PieceIdentity;
const roles: FantasyPieceType[] = [
  'king',
  'queen',
  'archwizard',
  'knight-commander',
  'moving-fortress',
  'grunt',
];
describe('equipment-compatible injury and death plans', () => {
  it('does not turn force-storing weapons into heat attacks', () => {
    const caps = attackCapabilities(
      piece('knight-commander', { mythicArm: MYTHIC_ARMS[5] }),
    );
    expect(woundMechanismCompatible('deep-burns', caps)).toBe(false);
    expect(woundMechanismCompatible('cracked-ribs', caps)).toBe(true);
    expect(deathMechanismCompatible('hostile-magic', caps)).toBe(false);
  });
  it('resolves existing Fortress loadouts without rerolling or inventing a blade', () => {
    const p = piece('moving-fortress', {
      backstory: `${FORTRESS_PRIMARY_WEAPONS[4]}. ${FORTRESS_ATTACHMENTS[0]}.`,
    });
    const loadout = fortressLoadout(p)!;
    expect(loadout.primaryWeapon).toBe(FORTRESS_PRIMARY_WEAPONS[4]);
    expect(loadout.capabilities).not.toContain('cut');
    expect(
      fortressLoadout({
        ...p,
        backstory: `${FORTRESS_PRIMARY_WEAPONS[4]}. ${FORTRESS_ATTACHMENTS[8]}.`,
      })?.capabilities,
    ).toContain('cut');
    expect(
      fortressLoadout({
        ...p,
        backstory: 'An old engine with forgotten weapons.',
      }),
    ).toBeNull();
    expect(
      fortressLoadout({
        ...p,
        backstory: p.backstory + FORTRESS_PRIMARY_WEAPONS[1],
      }),
    ).toBeNull();
  });
  it('uses existing pawn magic rules and keeps arrow attacks available', () => {
    expect(
      attackCapabilities(piece('grunt', { viewpointRole: 'archer' })),
    ).toContain('projectile');
    expect(
      attackCapabilities(piece('grunt', { viewpointRole: 'scout' })),
    ).toContain('projectile');
    expect(
      attackCapabilities(piece('grunt', { viewpointRole: 'mage acolyte' })),
    ).toContain('magic');
    expect(
      attackCapabilities(piece('grunt', { viewpointRole: 'queen candidate' })),
    ).not.toContain('magic');
    expect(
      attackCapabilities(piece('grunt', { viewpointRole: 'shield-bearer' })),
    ).not.toContain('magic');
  });
  it('leaves unrecognized legacy equipment uncertain', () => {
    const legacy = piece('knight-commander', {
      backstory: 'A veteran of many wars.',
    });
    expect(establishedMythicArm(legacy)).toBeNull();
    expect(attackCapabilities(legacy)).toBeNull();
    expect(woundMechanismCompatible('deep-burns', null)).toBe(true);
  });
  it('has a compatible wound and fatal method for every supported combat pairing', () => {
    const sources = [
      ...MYTHIC_ARMS.map((arm) =>
        piece('knight-commander', { mythicArm: arm }),
      ),
      ...FORTRESS_PRIMARY_WEAPONS.map((weapon) =>
        piece('moving-fortress', {
          backstory: `${weapon}. ${FORTRESS_ATTACHMENTS[0]}.`,
        }),
      ),
      ...[
        'archer',
        'scout',
        'swordsman',
        'mage acolyte',
        'queen candidate',
      ].map((viewpointRole) => piece('grunt', { viewpointRole })),
      ...['king', 'queen', 'archwizard'].map((role) =>
        piece(role as FantasyPieceType),
      ),
    ];
    for (const source of sources)
      for (const target of roles) {
        const caps = attackCapabilities(source);
        expect(
          eligibleWoundCatalogEntries(
            target,
            'victim-retaliation',
            source.viewpointRole,
          ).filter((w) =>
            woundMechanismCompatible(w.id as WoundCatalogId, caps),
          ).length,
        ).toBeGreaterThan(0);
        const selected = selectDeathCatalogEntry(
          target,
          target === 'king' ? 'checkmate' : 'capture',
          source.fantasyType,
          'coverage',
          caps,
        );
        expect(deathMechanismCompatible(selected.method, caps)).toBe(true);
      }
  });
});
