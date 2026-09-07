export interface PawnAbilityContract {
  role: string;
  canCastMagic: boolean;
  authorizedCombatMethods: readonly string[];
  authorizedSupportMethods: readonly string[];
  forbiddenAbilities: readonly string[];
  appliesUntilPromotion: true;
}

const COMMON_FORBIDDEN_MAGIC = [
  'direct spellcasting',
  'creating magical fire, lightning, force, or projectiles',
  'raising a personal magical ward',
  'teleportation',
  'Archwizard or Queen-level magic',
] as const;

const ROLE_ABILITIES: Record<
  string,
  Omit<PawnAbilityContract, 'role' | 'appliesUntilPromotion'>
> = {
  'mage acolyte': {
    canCastMagic: true,
    authorizedCombatMethods: [
      'ordinary sidearm',
      'minor apprentice elemental effect',
      'small disruptive spell',
    ],
    authorizedSupportMethods: [
      'small ward',
      'detection light',
      'brief magical illumination',
      'minor magical assistance',
    ],
    forbiddenAbilities: [
      'teleportation',
      'broad high sorcery',
      'large battlefield spell',
      'Archwizard or Queen-level magic',
    ],
  },
  archer: mundane(
    ['bow and arrows', 'knife or ordinary sidearm'],
    ['ranged observation', 'marking targets'],
  ),
  'shield-bearer': mundane(
    ['shield strike', 'ordinary sidearm'],
    ['physical shield wall', 'covering an ally with a shield'],
  ),
  'standard-bearer': mundane(
    ['reinforced company standard', 'standard point', 'ordinary sidearm'],
    ['signals', 'rallying soldiers', 'marking a formation'],
  ),
  spearman: mundane(
    ['spear', 'spear shaft', 'ordinary sidearm'],
    ['holding a physical formation', 'guarding an approach'],
  ),
  swordsman: mundane(['sword', 'ordinary sidearm'], ['close-combat defense']),
  'field medic': mundane(
    ['medic staff', 'knife or ordinary sidearm'],
    ['bandaging', 'stabilizing an injury', 'carrying medical supplies'],
  ),
  scout: mundane(
    ['bow and arrows', 'knife or ordinary sidearm', 'mundane trap'],
    ['tracking', 'reconnaissance', 'route marking'],
  ),
  quartermaster: mundane(
    ['ordinary sidearm', 'available mundane supplies'],
    ['managing food, medicine, ammunition, and equipment'],
  ),
  'company captain': mundane(
    ['sword, spear, or ordinary sidearm'],
    ['orders', 'signals', 'tactical coordination'],
  ),
  'queen candidate': mundane(
    ['sword, spear, or ordinary sidearm'],
    ['advanced martial training', 'tactical observation'],
  ),
};

function mundane(
  authorizedCombatMethods: readonly string[],
  authorizedSupportMethods: readonly string[],
): Omit<PawnAbilityContract, 'role' | 'appliesUntilPromotion'> {
  return {
    canCastMagic: false,
    authorizedCombatMethods,
    authorizedSupportMethods,
    forbiddenAbilities: COMMON_FORBIDDEN_MAGIC,
  };
}

export function pawnAbilityContract(role: string): PawnAbilityContract {
  const normalizedRole = role.trim().toLowerCase();
  const abilities =
    ROLE_ABILITIES[normalizedRole] ??
    mundane(
      ['ordinary soldier weapon'],
      ['ordinary soldier movement and assistance'],
    );
  return {
    role: normalizedRole,
    ...abilities,
    appliesUntilPromotion: true,
  };
}
