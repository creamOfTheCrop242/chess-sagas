import type { PieceIdentity } from './models/game-ledger';

export const MYTHIC_ARMS = [
  {
    id: 'stormbound-great-hammer',
    name: 'stormbound great hammer',
    description:
      'a stormbound great hammer whose impacts release concussive thunder',
    signatures: ['stormbound great hammer', 'concussive thunder'],
    strainInjury:
      'Concussive recoil from the stormbound great hammer tears through the wielder’s weapon arm and splits the bracer at the wrist',
    strainEffects: [
      'Persistent pain and weakness in the weapon arm',
      'Full-force hammer blows become slower and harder to control',
    ],
  },
  {
    id: 'seal-forged-greatsword',
    name: 'Seal-forged greatsword',
    description: 'a Seal-forged greatsword that burns through hostile wards',
    signatures: ['seal-forged greatsword', 'burns through hostile wards'],
    strainInjury:
      'Ward-fire recoils through the Seal-forged greatsword and burns the wielder’s hands and forearm',
    strainEffects: [
      'Persistent burns along the weapon arm',
      'Sustained ward-cutting strikes become painful and difficult',
    ],
  },
  {
    id: 'gravity-mace',
    name: 'gravity mace',
    description:
      'a gravity mace that multiplies its weight at the instant of impact',
    signatures: ['gravity mace', 'multiplies its weight'],
    strainInjury:
      'The gravity mace multiplies its weight too sharply and wrenches the wielder’s shoulder and wrist',
    strainEffects: [
      'A strained shoulder limits the weapon arm',
      'Repeated gravity-weighted blows risk worsening the injury',
    ],
  },
  {
    id: 'ward-breaking-poleaxe',
    name: 'ward-breaking poleaxe',
    description:
      'a ward-breaking poleaxe charged to tear open magical defenses',
    signatures: ['ward-breaking poleaxe', 'tear open magical defenses'],
    strainInjury:
      'A ward-breaking discharge runs back through the poleaxe and burns the wielder’s palms and forearm',
    strainEffects: [
      'Burned hands weaken the wielder’s grip',
      'Breaking another powerful ward risks renewed magical backlash',
    ],
  },
  {
    id: 'crescent-glaive',
    name: 'crescent glaive',
    description:
      'a crescent glaive that throws a short arc of cutting realm-light',
    signatures: ['crescent glaive', 'cutting realm-light'],
    strainInjury:
      'Cutting realm-light rebounds through the crescent glaive and opens burns along the wielder’s arm and side',
    strainEffects: [
      'Realm-light burns flare when the glaive is charged',
      'Wide cutting arcs become painful to sustain',
    ],
  },
  {
    id: 'force-storing-war-axe',
    name: 'two-handed war axe',
    description:
      'a two-handed war axe whose edge stores the force of every blocked blow',
    signatures: ['two-handed war axe', 'stores the force', 'stored force'],
    strainInjury:
      'Stored force discharges backward through the two-handed war axe and tears the wielder’s shoulder and elbow',
    strainEffects: [
      'The injured shoulder limits two-handed swings',
      'Releasing stored force risks another violent recoil',
    ],
  },
  {
    id: 'oathbound-swords',
    name: 'matched pair of oathbound swords',
    description:
      'a matched pair of oathbound swords whose alternating strikes build and release cutting arcs of realm-light',
    signatures: [
      'matched pair of oathbound swords',
      'oathbound swords',
      'paired swords',
      'alternating strikes',
      'cutting arcs',
    ],
    strainInjury:
      'The oathbound swords release their built charge unevenly and burn the wielder’s hands and forearms',
    strainEffects: [
      'Burned hands disrupt the paired blades’ alternating rhythm',
      'Releasing another cutting arc risks renewed magical backlash',
    ],
  },
] as const;

export type MythicArmId = (typeof MYTHIC_ARMS)[number]['id'];
export type MythicArm = (typeof MYTHIC_ARMS)[number];

export function mythicArmForCommander(
  piece: Pick<PieceIdentity, 'originalSquare' | 'backstory' | 'mythicArm'>,
  seed: string,
): MythicArm {
  if (piece.mythicArm) {
    const structured = MYTHIC_ARMS.find(
      (arm) => arm.id === piece.mythicArm?.id,
    );
    if (structured) return structured;
  }
  const backstory = piece.backstory?.toLowerCase() ?? '';
  const legacy = MYTHIC_ARMS.find((arm) =>
    arm.signatures.some((signature) =>
      backstory.includes(signature.toLowerCase()),
    ),
  );
  if (legacy) return legacy;
  const squares = ['b1', 'g1', 'b8', 'g8'];
  const index = Math.max(0, squares.indexOf(piece.originalSquare));
  return MYTHIC_ARMS[
    (hashSeed(`${seed}:mythic-arms`) + index) % MYTHIC_ARMS.length
  ];
}

export function mentionedMythicArms(value: string): MythicArm[] {
  const normalized = value.toLowerCase();
  return MYTHIC_ARMS.filter((arm) =>
    arm.signatures.some((signature) =>
      normalized.includes(signature.toLowerCase()),
    ),
  );
}

export function mentionsIncompatibleWeaponKind(
  value: string,
  assignedArm: MythicArm,
): boolean {
  const normalized = value.toLowerCase();
  const mentionedKinds = [
    ['hammer', /\bhammers?\b/],
    ['sword', /\b(?:greatswords?|swords?)\b/],
    ['mace', /\bmaces?\b/],
    ['poleaxe', /\bpoleaxes?\b/],
    ['glaive', /\bglaives?\b/],
    ['axe', /\b(?:war[ -]axes?|axes?)\b/],
  ]
    .filter(([, pattern]) => (pattern as RegExp).test(normalized))
    .map(([kind]) => kind as string);
  if (mentionedKinds.length === 0) return false;

  const assignedKind =
    assignedArm.id === 'stormbound-great-hammer'
      ? 'hammer'
      : assignedArm.id === 'seal-forged-greatsword' ||
          assignedArm.id === 'oathbound-swords'
        ? 'sword'
        : assignedArm.id === 'gravity-mace'
          ? 'mace'
          : assignedArm.id === 'ward-breaking-poleaxe'
            ? 'poleaxe'
            : assignedArm.id === 'crescent-glaive'
              ? 'glaive'
              : 'axe';

  return mentionedKinds.some((kind) => kind !== assignedKind);
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
