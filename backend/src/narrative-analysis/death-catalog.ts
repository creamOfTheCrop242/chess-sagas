import type { FantasyPieceType } from '../chess/models/game-ledger';

export const DEATH_EVENT_KINDS = [
  'capture',
  'checkmate',
  'accepted-surrender',
  'rejected-surrender',
] as const;
export type DeathEventKind = (typeof DEATH_EVENT_KINDS)[number];

export const DEATH_METHODS = [
  'penetration',
  'slashing',
  'decapitation',
  'blunt-force',
  'crushing',
  'projectile',
  'hostile-magic',
  'structural-collapse',
  'fortress-ram',
  'fortress-round',
  'mythic-arm',
  'ward-collapse',
  'augmentation-collapse',
  'command-cradle-destruction',
  'life-support-failure',
  'seal-backlash',
] as const;
export type DeathMethod = (typeof DEATH_METHODS)[number];

export const DEATH_TARGET_AREAS = [
  'head',
  'neck',
  'chest',
  'abdomen',
  'whole-body',
  'existing-wound',
  'armor',
  'casting-wards',
  'augmentation-network',
  'fortress-hull',
  'fortress-command-cradle',
  'fortress-life-support',
  'royal-seal-bond',
] as const;
export type DeathTargetArea = (typeof DEATH_TARGET_AREAS)[number];

export interface DeathCatalogEntry {
  id: string;
  label: string;
  eventKinds: readonly DeathEventKind[];
  victimTypes: readonly FantasyPieceType[];
  killerTypes: readonly FantasyPieceType[];
  method: DeathMethod;
  targetArea: DeathTargetArea;
  dismemberment: 'forbidden' | 'optional' | 'required';
  requiresExistingWound: boolean;
  decisiveActorRequired: boolean;
  narrationGuidance: string;
  forbiddenClaims: readonly string[];
}

const ALL_TYPES = [
  'king',
  'queen',
  'archwizard',
  'moving-fortress',
  'knight-commander',
  'grunt',
] as const satisfies readonly FantasyPieceType[];
const LIVING_NON_KINGS = [
  'queen',
  'archwizard',
  'knight-commander',
  'grunt',
] as const satisfies readonly FantasyPieceType[];
const ENHANCED_WARRIORS = [
  'queen',
  'knight-commander',
] as const satisfies readonly FantasyPieceType[];

const STANDARD_CAPTURE_FORBIDDEN = [
  'The victim survives the ledger-confirmed capture',
  'A character other than the ledger captor delivers the decisive injury',
  'The victim dies before the capture ply',
] as const;
const FORTRESS_DEATH_FORBIDDEN = [
  ...STANDARD_CAPTURE_FORBIDDEN,
  'The embedded pilot escapes or survives outside the Fortress',
  'The Fortress is treated as an occupied building or staffed vehicle',
  'An unnamed crew dies in place of the sole embedded pilot',
] as const;

export const DEATH_CATALOG = [
  {
    id: 'fatal-chest-penetration',
    label: 'Fatal chest penetration',
    eventKinds: ['capture'],
    victimTypes: LIVING_NON_KINGS,
    killerTypes: ALL_TYPES,
    method: 'penetration',
    targetArea: 'chest',
    dismemberment: 'forbidden',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The ledger captor drives or fires a compatible weapon through the chest. Match the established weapon, magic, or Fortress system.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'fatal-abdominal-penetration',
    label: 'Fatal abdominal penetration',
    eventKinds: ['capture'],
    victimTypes: LIVING_NON_KINGS,
    killerTypes: ALL_TYPES,
    method: 'penetration',
    targetArea: 'abdomen',
    dismemberment: 'forbidden',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'A compatible attack from the ledger captor causes catastrophic abdominal damage and unmistakable death.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'fatal-throat-wound',
    label: 'Fatal throat wound',
    eventKinds: ['capture'],
    victimTypes: LIVING_NON_KINGS,
    killerTypes: ALL_TYPES,
    method: 'slashing',
    targetArea: 'neck',
    dismemberment: 'optional',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The ledger captor cuts, tears, or penetrates the throat with an established compatible attack.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'decapitation',
    label: 'Decapitation',
    eventKinds: ['capture', 'rejected-surrender'],
    victimTypes: LIVING_NON_KINGS,
    killerTypes: ['queen', 'knight-commander', 'grunt'],
    method: 'decapitation',
    targetArea: 'neck',
    dismemberment: 'required',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'A ledger-authorized executioner or captor using an established edged weapon removes the victim’s head.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'crushed-skull',
    label: 'Crushed skull',
    eventKinds: ['capture'],
    victimTypes: LIVING_NON_KINGS,
    killerTypes: ALL_TYPES,
    method: 'blunt-force',
    targetArea: 'head',
    dismemberment: 'forbidden',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'A compatible blunt strike, magical impact, or Fortress attack from the ledger captor causes fatal head trauma.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'broken-neck',
    label: 'Broken neck',
    eventKinds: ['capture'],
    victimTypes: LIVING_NON_KINGS,
    killerTypes: ALL_TYPES,
    method: 'blunt-force',
    targetArea: 'neck',
    dismemberment: 'forbidden',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The ledger captor’s impact, throw, or crushing blow breaks the victim’s neck.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'massive-blunt-trauma',
    label: 'Massive blunt-force trauma',
    eventKinds: ['capture'],
    victimTypes: LIVING_NON_KINGS,
    killerTypes: ALL_TYPES,
    method: 'blunt-force',
    targetArea: 'whole-body',
    dismemberment: 'optional',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The ledger captor kills through overwhelming impact using only established strength, weapons, magic, or machinery.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'fatal-magic-burn',
    label: 'Fatal magical burning',
    eventKinds: ['capture'],
    victimTypes: LIVING_NON_KINGS,
    killerTypes: ['queen', 'archwizard', 'moving-fortress', 'grunt'],
    method: 'hostile-magic',
    targetArea: 'whole-body',
    dismemberment: 'forbidden',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'Hostile magic controlled by the ledger captor burns the victim fatally. A grunt must have an established magical subclass or promoted form.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'magical-disintegration',
    label: 'Magical disintegration',
    eventKinds: ['capture'],
    victimTypes: LIVING_NON_KINGS,
    killerTypes: ['queen', 'archwizard', 'moving-fortress'],
    method: 'hostile-magic',
    targetArea: 'whole-body',
    dismemberment: 'forbidden',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'A sufficiently powerful established magical attack from the ledger captor destroys the victim’s body. Do not use for ordinary low-power magic.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'fatal-projectile',
    label: 'Fatal projectile strike',
    eventKinds: ['capture'],
    victimTypes: LIVING_NON_KINGS,
    killerTypes: ['queen', 'archwizard', 'moving-fortress', 'grunt'],
    method: 'projectile',
    targetArea: 'chest',
    dismemberment: 'forbidden',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'An established arrow, spell projectile, thrown weapon, or magic round from the ledger captor causes the fatal injury.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'fortress-ram-crushing',
    label: 'Crushed by a Moving Fortress',
    eventKinds: ['capture'],
    victimTypes: LIVING_NON_KINGS,
    killerTypes: ['moving-fortress'],
    method: 'fortress-ram',
    targetArea: 'whole-body',
    dismemberment: 'optional',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The named embedded pilot deliberately drives the Fortress’s ram, prow, wheels, or mass through the victim.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'fortress-round-kill',
    label: 'Killed by a magic round',
    eventKinds: ['capture'],
    victimTypes: LIVING_NON_KINGS,
    killerTypes: ['moving-fortress'],
    method: 'fortress-round',
    targetArea: 'whole-body',
    dismemberment: 'optional',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The named embedded pilot fires the Fortress’s established cannon or magic-round weapon and lands the fatal shot.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'fatal-structural-collapse',
    label: 'Fatal structural collapse',
    eventKinds: ['capture'],
    victimTypes: LIVING_NON_KINGS,
    killerTypes: ALL_TYPES,
    method: 'structural-collapse',
    targetArea: 'whole-body',
    dismemberment: 'optional',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The ledger captor deliberately causes or exploits a collapse that kills the victim; the environment cannot replace the captor as decisive actor.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'mythic-arm-kill',
    label: 'Killed by a Mythic Arm',
    eventKinds: ['capture', 'rejected-surrender'],
    victimTypes: LIVING_NON_KINGS,
    killerTypes: ['knight-commander'],
    method: 'mythic-arm',
    targetArea: 'whole-body',
    dismemberment: 'optional',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The Commander’s exact assigned Mythic Arm delivers the fatal blow. Never substitute another weapon type.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'existing-wound-exploited',
    label: 'Existing wound fatally exploited',
    eventKinds: ['capture'],
    victimTypes: LIVING_NON_KINGS,
    killerTypes: ALL_TYPES,
    method: 'penetration',
    targetArea: 'existing-wound',
    dismemberment: 'optional',
    requiresExistingWound: true,
    decisiveActorRequired: true,
    narrationGuidance:
      'The ledger captor deliberately exploits one active structured wound owned by the victim; name no unplanned prior injury.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'archwizard-ward-collapse',
    label: 'Archwizard ward collapse',
    eventKinds: ['capture'],
    victimTypes: ['archwizard'],
    killerTypes: ALL_TYPES,
    method: 'ward-collapse',
    targetArea: 'casting-wards',
    dismemberment: 'optional',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The ledger captor breaks or bypasses the Archwizard’s ward and immediately delivers the fatal established attack.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'enhanced-armor-breach',
    label: 'Enhanced armor breached',
    eventKinds: ['capture'],
    victimTypes: ENHANCED_WARRIORS,
    killerTypes: ALL_TYPES,
    method: 'penetration',
    targetArea: 'armor',
    dismemberment: 'optional',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The ledger captor defeats the Queen’s or Commander’s established armor and causes a concrete fatal bodily injury beneath it.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'augmentation-collapse',
    label: 'Fatal augmentation collapse',
    eventKinds: ['capture'],
    victimTypes: ENHANCED_WARRIORS,
    killerTypes: ALL_TYPES,
    method: 'augmentation-collapse',
    targetArea: 'augmentation-network',
    dismemberment: 'forbidden',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The ledger captor’s attack catastrophically destabilizes the victim’s augmentations; the attack, not spontaneous overload, remains decisive.',
    forbiddenClaims: STANDARD_CAPTURE_FORBIDDEN,
  },
  {
    id: 'fortress-command-cradle-destroyed',
    label: 'Command cradle destroyed',
    eventKinds: ['capture'],
    victimTypes: ['moving-fortress'],
    killerTypes: ALL_TYPES,
    method: 'command-cradle-destruction',
    targetArea: 'fortress-command-cradle',
    dismemberment: 'forbidden',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The ledger captor destroys the command cradle and explicitly kills the named sole embedded pilot inside it.',
    forbiddenClaims: FORTRESS_DEATH_FORBIDDEN,
  },
  {
    id: 'fortress-life-support-rupture',
    label: 'Life-support core ruptured',
    eventKinds: ['capture'],
    victimTypes: ['moving-fortress'],
    killerTypes: ALL_TYPES,
    method: 'life-support-failure',
    targetArea: 'fortress-life-support',
    dismemberment: 'forbidden',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The ledger captor catastrophically damages life support. The named embedded pilot dies because survival outside the machine is impossible.',
    forbiddenClaims: FORTRESS_DEATH_FORBIDDEN,
  },
  {
    id: 'fortress-hull-to-cradle-penetration',
    label: 'Hull penetrated into the cradle',
    eventKinds: ['capture'],
    victimTypes: ['moving-fortress'],
    killerTypes: ALL_TYPES,
    method: 'penetration',
    targetArea: 'fortress-hull',
    dismemberment: 'forbidden',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The ledger captor breaches the hull and carries the fatal attack into the command cradle, killing the named pilot.',
    forbiddenClaims: FORTRESS_DEATH_FORBIDDEN,
  },
  {
    id: 'fortress-catastrophic-crush',
    label: 'Fortress catastrophically crushed',
    eventKinds: ['capture'],
    victimTypes: ['moving-fortress'],
    killerTypes: ALL_TYPES,
    method: 'crushing',
    targetArea: 'fortress-command-cradle',
    dismemberment: 'forbidden',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The ledger captor crushes or splits the Fortress deeply enough to destroy the cradle and kill its sole embedded pilot.',
    forbiddenClaims: FORTRESS_DEATH_FORBIDDEN,
  },
  {
    id: 'king-checkmate-penetration',
    label: 'King killed by a penetrating strike at checkmate',
    eventKinds: ['checkmate'],
    victimTypes: ['king'],
    killerTypes: ['king', 'queen', 'knight-commander', 'grunt'],
    method: 'penetration',
    targetArea: 'chest',
    dismemberment: 'optional',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The checking piece uses an established blade, spear, or compatible weapon to physically kill the trapped King. His Royal Seal fails only after his death severs the bond.',
    forbiddenClaims: [
      'The wrong piece delivers the fatal checkmate attack',
      'The King escapes or survives checkmate',
      'Royal Seal failure replaces the King’s physical death',
      'The scene invents a legal escape absent from the checkmate explanation',
    ],
  },
  {
    id: 'king-checkmate-blunt-force',
    label: 'King killed by blunt force at checkmate',
    eventKinds: ['checkmate'],
    victimTypes: ['king'],
    killerTypes: ['king', 'queen', 'knight-commander', 'grunt'],
    method: 'blunt-force',
    targetArea: 'head',
    dismemberment: 'forbidden',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The checking piece uses established strength or a compatible blunt weapon to physically kill the trapped King. The Royal Seal reacts afterward.',
    forbiddenClaims: [
      'The wrong piece delivers the fatal checkmate attack',
      'The King escapes or survives checkmate',
      'Royal Seal failure replaces the King’s physical death',
      'The scene invents a legal escape absent from the checkmate explanation',
    ],
  },
  {
    id: 'king-checkmate-hostile-magic',
    label: 'King killed by hostile magic at checkmate',
    eventKinds: ['checkmate'],
    victimTypes: ['king'],
    killerTypes: ['queen', 'archwizard', 'grunt'],
    method: 'hostile-magic',
    targetArea: 'whole-body',
    dismemberment: 'optional',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The checking piece uses only established magical ability to kill the trapped King’s body. His Royal Seal destabilizes after the fatal attack.',
    forbiddenClaims: [
      'The wrong piece delivers the fatal checkmate attack',
      'The King escapes or survives checkmate',
      'Royal Seal failure replaces the King’s physical death',
      'A nonmagical character invents unrestricted magic',
    ],
  },
  {
    id: 'king-checkmate-projectile',
    label: 'King killed by a projectile at checkmate',
    eventKinds: ['checkmate'],
    victimTypes: ['king'],
    killerTypes: ['queen', 'archwizard', 'moving-fortress', 'grunt'],
    method: 'projectile',
    targetArea: 'chest',
    dismemberment: 'optional',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The checking piece fires an established arrow, spell projectile, thrown weapon, or magic round that physically kills the trapped King. The Royal Seal fails afterward.',
    forbiddenClaims: [
      'The wrong piece delivers the fatal checkmate attack',
      'The King escapes or survives checkmate',
      'Royal Seal failure replaces the King’s physical death',
      'The attacker uses a projectile absent from established abilities',
    ],
  },
  {
    id: 'king-checkmate-fortress-ram',
    label: 'King crushed by a Moving Fortress at checkmate',
    eventKinds: ['checkmate'],
    victimTypes: ['king'],
    killerTypes: ['moving-fortress'],
    method: 'fortress-ram',
    targetArea: 'whole-body',
    dismemberment: 'optional',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'The named embedded pilot drives the checking Fortress into the trapped King and physically kills him. The Royal Seal fails as a consequence of his death.',
    forbiddenClaims: [
      'The wrong piece delivers the fatal checkmate attack',
      'The King escapes or survives checkmate',
      'Royal Seal failure replaces the King’s physical death',
      'An unnamed Fortress crew performs the attack',
    ],
  },
  {
    id: 'king-surrender-execution',
    label: 'Surrender rejected and King executed',
    eventKinds: ['rejected-surrender'],
    victimTypes: ['king'],
    killerTypes: ALL_TYPES,
    method: 'blunt-force',
    targetArea: 'whole-body',
    dismemberment: 'optional',
    requiresExistingWound: false,
    decisiveActorRequired: true,
    narrationGuidance:
      'A specifically authorized surviving enemy rejects the surrender and executes the King using established abilities.',
    forbiddenClaims: [
      'The surrender is accepted',
      'An unauthorized or dead character performs the execution',
      'The defeated King survives the established fate',
    ],
  },
  {
    id: 'king-seal-destruction',
    label: 'King destroyed with his Royal Seal',
    eventKinds: ['accepted-surrender', 'rejected-surrender'],
    victimTypes: ['king'],
    killerTypes: [],
    method: 'seal-backlash',
    targetArea: 'royal-seal-bond',
    dismemberment: 'forbidden',
    requiresExistingWound: false,
    decisiveActorRequired: false,
    narrationGuidance:
      'The defeated King deliberately destroys or catastrophically breaks his own Royal Seal and dies from the resulting backlash.',
    forbiddenClaims: [
      'Another character is credited with directly killing the King',
      'The King survives the destruction of his established Seal bond',
      'The Seal remains intact despite the selected fate',
    ],
  },
] as const satisfies readonly DeathCatalogEntry[];

export type DeathCatalogId = (typeof DEATH_CATALOG)[number]['id'];

export function deathCatalogEntry(id: string): DeathCatalogEntry | undefined {
  return DEATH_CATALOG.find((entry) => entry.id === id);
}

export function eligibleDeathCatalogEntries(
  victimType: FantasyPieceType,
  eventKind: DeathEventKind,
  killerType?: FantasyPieceType,
): DeathCatalogEntry[] {
  return DEATH_CATALOG.filter((catalogEntry) => {
    const entry: DeathCatalogEntry = catalogEntry;
    return (
      entry.victimTypes.includes(victimType) &&
      entry.eventKinds.includes(eventKind) &&
      (killerType === undefined || entry.killerTypes.includes(killerType))
    );
  });
}

export function selectDeathCatalogEntry(
  victimType: FantasyPieceType,
  eventKind: DeathEventKind,
  killerType: FantasyPieceType | undefined,
  seed: string,
): DeathCatalogEntry {
  const compatible = eligibleDeathCatalogEntries(
    victimType,
    eventKind,
    killerType,
  );
  if (compatible.length === 0) {
    throw new Error(
      `No death catalog entry supports ${victimType}/${eventKind}/${killerType ?? 'no-killer'}`,
    );
  }
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return compatible[(hash >>> 0) % compatible.length];
}
