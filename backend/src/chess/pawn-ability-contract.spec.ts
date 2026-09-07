import { pawnAbilityContract } from './pawn-ability-contract';

describe('pawn ability contracts', () => {
  it('limits ordinary pawn roles to mundane abilities', () => {
    const standardBearer = pawnAbilityContract('standard-bearer');

    expect(standardBearer.canCastMagic).toBe(false);
    expect(standardBearer.authorizedCombatMethods).toContain('standard point');
    expect(standardBearer.forbiddenAbilities).toContain('direct spellcasting');
    expect(standardBearer.appliesUntilPromotion).toBe(true);
  });

  it('allows only apprentice-scale magic for mage acolytes', () => {
    const mageAcolyte = pawnAbilityContract('mage acolyte');

    expect(mageAcolyte.canCastMagic).toBe(true);
    expect(mageAcolyte.authorizedSupportMethods).toContain('small ward');
    expect(mageAcolyte.forbiddenAbilities).toContain('teleportation');
    expect(mageAcolyte.forbiddenAbilities).toContain('broad high sorcery');
  });

  it('defaults unknown roles to ordinary soldier capabilities', () => {
    const unknown = pawnAbilityContract('unknown specialist');

    expect(unknown.canCastMagic).toBe(false);
    expect(unknown.authorizedCombatMethods).toEqual([
      'ordinary soldier weapon',
    ]);
  });
});
