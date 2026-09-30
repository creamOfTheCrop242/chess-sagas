import type { PieceIdentity, FantasyPieceType } from './models/game-ledger';
import { establishedMythicArm, type MythicArmId } from './mythic-arms';
export { establishedMythicArm } from './mythic-arms';
import { pawnAbilityContract } from './pawn-ability-contract';
import type { WoundCatalogId } from '../narrative-analysis/wound-catalog';
import type { DeathMethod } from '../narrative-analysis/death-catalog';

export type AttackCapability =
  'cut' | 'pierce' | 'impact' | 'heat' | 'projectile' | 'magic' | 'ram';
export const FORTRESS_PRIMARY_WEAPONS = [
  'a turreted heavy cannon that fires single armor-breaking magic rounds',
  'a rotary gatling gun that saturates advancing formations with rapid volleys of smaller magic rounds',
  'twin long-barreled cannons built for precise fire against distant engines and fortifications',
  'a short-barreled siege bombard that launches unstable magic shells in devastating arcs',
  'a bank of repeating ward-rifles designed to rake infantry lines without slowing the engine',
  'a siegebolt cannon whose concentrated magic round detonates only after penetrating armor or masonry',
  'paired broadside batteries that fire magic rounds to either side while the Fortress advances',
  'a rotating storm-caster that propels charged magic rounds through smoke, rain, and hostile wards',
] as const;
export const FORTRESS_ATTACHMENTS = [
  'Its reinforced crushing prow can lower into a wedge for ramming gates, engines, and massed formations',
  'A frontal siege drill helps its ram bite through warded walls and the armored shells of rival Fortresses',
  'Retractable stabilizer claws anchor the hull against recoil or let it drag itself across treacherous ground',
  'A rune-plated shield generator can briefly reinforce one face of the hull while leaving the others exposed',
  'A deployable bridge frame lets soldiers cross trenches and canals beneath covering fire',
  'Smoke projectors and false signal lamps conceal its approach before a sudden ramming charge',
  'A recovery winch can pull trapped soldiers, wreckage, or damaged allied engines out of a killing ground',
  'An elevated observation mast feeds the pilot range and movement data through enchanted lenses',
  'Side-mounted blade wheels tear through barricades and punish enemies who crowd the hull during a charge',
  'A ward-siphon array steals a brief pulse of hostile magic to strengthen the next shot or impact',
] as const;
export interface FortressLoadout {
  primaryWeapon: string;
  attachment: string;
  capabilities: AttackCapability[];
}

export function fortressLoadout(
  piece: Pick<PieceIdentity, 'backstory' | 'fortressLoadout'>,
): FortressLoadout | null {
  if (piece.fortressLoadout) return piece.fortressLoadout;
  const weapons = FORTRESS_PRIMARY_WEAPONS.filter((w) =>
    piece.backstory?.includes(w),
  );
  const attachments = FORTRESS_ATTACHMENTS.filter((a) =>
    piece.backstory?.includes(a),
  );
  if (weapons.length !== 1 || attachments.length !== 1) return null;
  return {
    primaryWeapon: weapons[0],
    attachment: attachments[0],
    capabilities: [
      'projectile',
      'impact',
      'heat',
      'ram',
      ...(attachments[0] === FORTRESS_ATTACHMENTS[8] ? ['cut' as const] : []),
    ],
  };
}
const ARM_CAPABILITIES: Record<MythicArmId, AttackCapability[]> = {
  'stormbound-great-hammer': ['impact'],
  'seal-forged-greatsword': ['cut', 'pierce', 'heat'],
  'gravity-mace': ['impact'],
  'ward-breaking-poleaxe': ['cut', 'pierce', 'heat'],
  'crescent-glaive': ['cut'],
  'force-storing-war-axe': ['cut', 'impact'],
  'oathbound-swords': ['cut', 'pierce', 'heat'],
};
export function attackCapabilities(
  piece: PieceIdentity | undefined,
  type?: FantasyPieceType,
): AttackCapability[] | null {
  if (!piece) return null;
  const role = type ?? piece.fantasyType;
  if (role === 'knight-commander') {
    const arm = establishedMythicArm(piece);
    return arm
      ? [...new Set<AttackCapability>(['impact', ...ARM_CAPABILITIES[arm.id]])]
      : null;
  }
  if (role === 'moving-fortress')
    return fortressLoadout(piece)?.capabilities ?? null;
  if (['king', 'queen', 'archwizard'].includes(role))
    return ['cut', 'pierce', 'impact', 'heat', 'projectile', 'magic'];
  if (role !== 'grunt') return null;
  const physical: AttackCapability[] = ['cut', 'pierce', 'impact'];
  if (['archer', 'scout'].includes(piece.viewpointRole ?? ''))
    physical.push('projectile');
  if (
    (
      piece.pawnAbilityContract ??
      pawnAbilityContract(piece.viewpointRole ?? '')
    ).canCastMagic
  )
    physical.push('magic', 'heat');
  return physical;
}
const WOUND_MECHANISMS: Record<WoundCatalogId, AttackCapability[]> = {
  'facial-cut': ['cut'],
  concussion: ['impact'],
  'impaired-eye': ['cut', 'pierce', 'projectile'],
  'shoulder-gash': ['cut'],
  'arrow-through-shoulder': ['projectile'],
  'fractured-forearm': ['impact'],
  'crushed-hand': ['impact'],
  'severed-hand': ['cut'],
  'cracked-ribs': ['impact'],
  'punctured-lung': ['pierce', 'projectile'],
  'abdominal-puncture': ['pierce', 'projectile'],
  'spinal-impact': ['impact'],
  'fractured-leg': ['impact'],
  'arrow-in-leg': ['projectile'],
  'crushed-ankle': ['impact'],
  'deep-burns': ['heat'],
  'casting-channel-burn': ['magic'],
  'spell-backlash-tremor': ['magic'],
  'augmentation-overload': ['magic'],
  'mythic-arm-backlash': ['impact', 'heat'],
  'fortress-prow-breach': ['impact', 'pierce', 'projectile', 'ram'],
  'fortress-hull-breach': ['impact', 'pierce', 'projectile', 'ram'],
  'fortress-steering-damage': ['impact', 'projectile'],
  'fortress-drive-damage': ['impact', 'projectile'],
  'fortress-weapon-rupture': ['impact', 'projectile'],
  'fortress-restraint-failure': ['impact'],
  'fortress-life-support-instability': ['impact', 'projectile'],
};
export function woundMechanismCompatible(
  id: WoundCatalogId,
  capabilities: AttackCapability[] | null,
): boolean {
  return (
    capabilities === null ||
    WOUND_MECHANISMS[id].some((c) => capabilities.includes(c))
  );
}
const DEATH_MECHANISMS: Record<DeathMethod, AttackCapability[]> = {
  penetration: ['pierce', 'projectile'],
  slashing: ['cut'],
  decapitation: ['cut'],
  'blunt-force': ['impact'],
  crushing: ['impact', 'ram'],
  projectile: ['projectile'],
  'hostile-magic': ['magic', 'heat'],
  'structural-collapse': ['impact', 'ram'],
  'fortress-ram': ['ram'],
  'fortress-round': ['projectile'],
  'mythic-arm': ['cut', 'impact', 'pierce'],
  'ward-collapse': ['magic', 'heat'],
  'augmentation-collapse': ['magic', 'impact'],
  'command-cradle-destruction': ['impact', 'pierce', 'projectile'],
  'life-support-failure': ['impact', 'pierce', 'projectile'],
  'seal-backlash': ['magic'],
};
export function deathMechanismCompatible(
  method: DeathMethod,
  capabilities: AttackCapability[] | null,
): boolean {
  return (
    capabilities === null ||
    DEATH_MECHANISMS[method].some((c) => capabilities.includes(c))
  );
}
