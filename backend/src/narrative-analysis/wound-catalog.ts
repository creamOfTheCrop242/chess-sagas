import type { FantasyPieceType } from '../chess/models/game-ledger';
import type { WoundCauseType } from './wound-planning';

export const WOUND_SEVERITIES = [
  'minor',
  'moderate',
  'severe',
  'critical',
  'crippling',
] as const;
export type WoundSeverity = (typeof WOUND_SEVERITIES)[number];

export const WOUND_BODY_AREAS = [
  'head',
  'eye',
  'shoulder',
  'arm',
  'hand',
  'chest',
  'abdomen',
  'back',
  'leg',
  'foot',
  'casting-channels',
  'armor',
  'fortress-prow',
  'fortress-hull',
  'fortress-steering',
  'fortress-drive',
  'fortress-weapons',
  'fortress-cradle',
  'fortress-life-support',
] as const;
export type WoundBodyArea = (typeof WOUND_BODY_AREAS)[number];

export const WOUND_EFFECTS = [
  'persistent-pain',
  'bleeding',
  'reduced-mobility',
  'reduced-grip',
  'reduced-weapon-control',
  'reduced-casting-control',
  'reduced-vision',
  'breathing-difficulty',
  'concussion-symptoms',
  'armor-breach',
  'augmentation-instability',
  'steering-impaired',
  'drive-impaired',
  'weapon-system-impaired',
  'cradle-restraint-failure',
  'pilot-trauma',
  'life-support-strain',
  'permanent-limb-loss',
] as const;
export type WoundEffect = (typeof WOUND_EFFECTS)[number];

export interface WoundCatalogEntry {
  id: string;
  label: string;
  bodyArea: WoundBodyArea;
  severity: WoundSeverity;
  effects: readonly WoundEffect[];
  ownerTypes: readonly FantasyPieceType[];
  causeTypes: readonly WoundCauseType[];
  sourceRoles?: readonly string[];
  recoverability: 'recoverable-with-scar' | 'persistent' | 'permanent';
  narrationGuidance: string;
}

const LIVING_TYPES = [
  'king',
  'queen',
  'archwizard',
  'knight-commander',
  'grunt',
] as const satisfies readonly FantasyPieceType[];
const MAGIC_TYPES = [
  'queen',
  'archwizard',
  'knight-commander',
  'grunt',
] as const satisfies readonly FantasyPieceType[];
const ALL_CAUSES = [
  'victim-retaliation',
  'environmental-hazard',
  'self-inflicted-strain',
] as const satisfies readonly WoundCauseType[];

export const WOUND_CATALOG = [
  {
    id: 'facial-cut',
    label: 'Facial cut',
    bodyArea: 'head',
    severity: 'minor',
    effects: ['persistent-pain', 'bleeding'],
    ownerTypes: LIVING_TYPES,
    causeTypes: ['victim-retaliation', 'environmental-hazard'],
    recoverability: 'recoverable-with-scar',
    narrationGuidance:
      'A visible but non-disabling cut to the brow, cheek, or jaw; never eye loss or skull trauma.',
  },
  {
    id: 'concussion',
    label: 'Concussion',
    bodyArea: 'head',
    severity: 'moderate',
    effects: ['concussion-symptoms', 'persistent-pain'],
    ownerTypes: LIVING_TYPES,
    causeTypes: ALL_CAUSES,
    recoverability: 'recoverable-with-scar',
    narrationGuidance:
      'A hard impact causes dizziness, nausea, confusion, and impaired balance without inventing a skull fracture.',
  },
  {
    id: 'impaired-eye',
    label: 'Impaired eye',
    bodyArea: 'eye',
    severity: 'severe',
    effects: ['reduced-vision', 'persistent-pain'],
    ownerTypes: LIVING_TYPES,
    causeTypes: ['victim-retaliation', 'environmental-hazard'],
    recoverability: 'persistent',
    narrationGuidance:
      'One eye is badly injured or obscured; describe reduced vision, not removal of the eye.',
  },
  {
    id: 'shoulder-gash',
    label: 'Deep shoulder gash',
    bodyArea: 'shoulder',
    severity: 'moderate',
    effects: ['persistent-pain', 'reduced-weapon-control'],
    ownerTypes: LIVING_TYPES,
    causeTypes: ['victim-retaliation', 'environmental-hazard'],
    recoverability: 'recoverable-with-scar',
    narrationGuidance:
      'A deep cut across one shoulder limits force and reach without severing the arm.',
  },
  {
    id: 'arrow-through-shoulder',
    label: 'Arrow through the shoulder',
    bodyArea: 'shoulder',
    severity: 'severe',
    effects: ['persistent-pain', 'bleeding', 'reduced-weapon-control'],
    ownerTypes: LIVING_TYPES,
    causeTypes: ['victim-retaliation'],
    sourceRoles: ['archer'],
    recoverability: 'persistent',
    narrationGuidance:
      "The defending archer fires an arrow through one shoulder during the capture. Preserve the archer as the source, keep the wounded attacker alive, and limit the attacker's force and reach afterward.",
  },
  {
    id: 'fractured-forearm',
    label: 'Fractured forearm',
    bodyArea: 'arm',
    severity: 'severe',
    effects: ['persistent-pain', 'reduced-grip', 'reduced-weapon-control'],
    ownerTypes: LIVING_TYPES,
    causeTypes: ['victim-retaliation', 'environmental-hazard'],
    recoverability: 'persistent',
    narrationGuidance:
      'One forearm is fractured. Preserve which arm is selected in structured wound details.',
  },
  {
    id: 'crushed-hand',
    label: 'Crushed hand',
    bodyArea: 'hand',
    severity: 'severe',
    effects: ['persistent-pain', 'reduced-grip', 'reduced-weapon-control'],
    ownerTypes: LIVING_TYPES,
    causeTypes: ['victim-retaliation', 'environmental-hazard'],
    recoverability: 'persistent',
    narrationGuidance:
      'Bones in one hand are crushed or broken; the hand remains attached but cannot grip normally.',
  },
  {
    id: 'severed-hand',
    label: 'Severed hand',
    bodyArea: 'hand',
    severity: 'crippling',
    effects: ['permanent-limb-loss', 'reduced-grip', 'reduced-weapon-control'],
    ownerTypes: LIVING_TYPES,
    causeTypes: ['victim-retaliation'],
    recoverability: 'permanent',
    narrationGuidance:
      'One hand is permanently severed during direct combat. Never restore it during the battle.',
  },
  {
    id: 'cracked-ribs',
    label: 'Cracked ribs',
    bodyArea: 'chest',
    severity: 'moderate',
    effects: ['persistent-pain', 'breathing-difficulty'],
    ownerTypes: LIVING_TYPES,
    causeTypes: ALL_CAUSES,
    recoverability: 'recoverable-with-scar',
    narrationGuidance:
      'Several ribs are cracked, making breathing, twisting, and exertion painful without puncturing a lung.',
  },
  {
    id: 'punctured-lung',
    label: 'Punctured lung',
    bodyArea: 'chest',
    severity: 'critical',
    effects: ['breathing-difficulty', 'bleeding', 'reduced-mobility'],
    ownerTypes: LIVING_TYPES,
    causeTypes: ['victim-retaliation'],
    recoverability: 'persistent',
    narrationGuidance:
      'A penetrating chest wound compromises one lung. The survivor remains alive but gravely limited.',
  },
  {
    id: 'abdominal-puncture',
    label: 'Abdominal puncture',
    bodyArea: 'abdomen',
    severity: 'severe',
    effects: ['persistent-pain', 'bleeding', 'reduced-mobility'],
    ownerTypes: LIVING_TYPES,
    causeTypes: ['victim-retaliation', 'environmental-hazard'],
    recoverability: 'persistent',
    narrationGuidance:
      'A narrow puncture penetrates the lower or side abdomen without becoming an immediately fatal organ wound.',
  },
  {
    id: 'spinal-impact',
    label: 'Severe back trauma',
    bodyArea: 'back',
    severity: 'critical',
    effects: ['persistent-pain', 'reduced-mobility'],
    ownerTypes: LIVING_TYPES,
    causeTypes: ['victim-retaliation', 'environmental-hazard'],
    recoverability: 'persistent',
    narrationGuidance:
      'A severe impact injures the back and limits movement; do not invent paralysis or a severed spine.',
  },
  {
    id: 'fractured-leg',
    label: 'Fractured leg',
    bodyArea: 'leg',
    severity: 'severe',
    effects: ['persistent-pain', 'reduced-mobility'],
    ownerTypes: LIVING_TYPES,
    causeTypes: ['victim-retaliation', 'environmental-hazard'],
    recoverability: 'persistent',
    narrationGuidance:
      'One thigh or lower leg is fractured, forcing an altered stance or gait without removing the limb.',
  },
  {
    id: 'arrow-in-leg',
    label: 'Arrow lodged in the leg',
    bodyArea: 'leg',
    severity: 'severe',
    effects: ['persistent-pain', 'bleeding', 'reduced-mobility'],
    ownerTypes: LIVING_TYPES,
    causeTypes: ['victim-retaliation'],
    sourceRoles: ['archer'],
    recoverability: 'persistent',
    narrationGuidance:
      "The defending archer lodges an arrow in the attacker's thigh or lower leg during the capture. Preserve the archer as the source, keep the wounded attacker alive, and show impaired movement afterward.",
  },
  {
    id: 'crushed-ankle',
    label: 'Crushed ankle',
    bodyArea: 'foot',
    severity: 'severe',
    effects: ['persistent-pain', 'reduced-mobility'],
    ownerTypes: LIVING_TYPES,
    causeTypes: ['victim-retaliation', 'environmental-hazard'],
    recoverability: 'persistent',
    narrationGuidance:
      'One ankle is crushed or badly broken, preventing normal footing and rapid changes of direction.',
  },
  {
    id: 'deep-burns',
    label: 'Deep burns',
    bodyArea: 'armor',
    severity: 'severe',
    effects: ['persistent-pain', 'armor-breach'],
    ownerTypes: LIVING_TYPES,
    causeTypes: ALL_CAUSES,
    recoverability: 'persistent',
    narrationGuidance:
      'Heat, magic, or burning debris breaches clothing or armor and leaves localized deep burns.',
  },
  {
    id: 'casting-channel-burn',
    label: 'Burned casting channels',
    bodyArea: 'casting-channels',
    severity: 'severe',
    effects: ['persistent-pain', 'reduced-casting-control'],
    ownerTypes: MAGIC_TYPES,
    causeTypes: ['victim-retaliation', 'self-inflicted-strain'],
    recoverability: 'persistent',
    narrationGuidance:
      'Magical channels in an arm, hand, or chest are burned, making later spellwork painful and unreliable.',
  },
  {
    id: 'spell-backlash-tremor',
    label: 'Spell-backlash tremor',
    bodyArea: 'casting-channels',
    severity: 'moderate',
    effects: ['reduced-casting-control', 'reduced-grip'],
    ownerTypes: MAGIC_TYPES,
    causeTypes: ['self-inflicted-strain'],
    recoverability: 'recoverable-with-scar',
    narrationGuidance:
      'Overloaded magic leaves a persistent tremor in the casting hand without inventing burns or limb loss.',
  },
  {
    id: 'augmentation-overload',
    label: 'Augmentation overload',
    bodyArea: 'armor',
    severity: 'severe',
    effects: ['augmentation-instability', 'persistent-pain'],
    ownerTypes: ['queen', 'knight-commander'],
    causeTypes: ['self-inflicted-strain'],
    recoverability: 'persistent',
    narrationGuidance:
      'Magical physical enhancements are overdriven, causing pain and unstable strength or speed without removing them.',
  },
  {
    id: 'mythic-arm-backlash',
    label: 'Mythic Arm backlash',
    bodyArea: 'arm',
    severity: 'moderate',
    effects: ['persistent-pain', 'reduced-weapon-control'],
    ownerTypes: ['knight-commander'],
    causeTypes: ['self-inflicted-strain'],
    recoverability: 'recoverable-with-scar',
    narrationGuidance:
      'The assigned Mythic Arm strains its wielder. The narration must preserve that exact weapon and its established abilities.',
  },
  {
    id: 'fortress-prow-breach',
    label: 'Breached prow',
    bodyArea: 'fortress-prow',
    severity: 'severe',
    effects: ['armor-breach', 'pilot-trauma'],
    ownerTypes: ['moving-fortress'],
    causeTypes: ['victim-retaliation', 'environmental-hazard'],
    recoverability: 'persistent',
    narrationGuidance:
      'The prow armor is breached and the impact transfers directly into the sole embedded pilot’s body.',
  },
  {
    id: 'fortress-hull-breach',
    label: 'Breached hull',
    bodyArea: 'fortress-hull',
    severity: 'critical',
    effects: ['armor-breach', 'pilot-trauma', 'life-support-strain'],
    ownerTypes: ['moving-fortress'],
    causeTypes: ['victim-retaliation', 'environmental-hazard'],
    recoverability: 'persistent',
    narrationGuidance:
      'The armored hull is penetrated, injuring the sole embedded pilot and placing pressure on life support without killing the pilot.',
  },
  {
    id: 'fortress-steering-damage',
    label: 'Damaged steering linkage',
    bodyArea: 'fortress-steering',
    severity: 'severe',
    effects: ['steering-impaired', 'pilot-trauma'],
    ownerTypes: ['moving-fortress'],
    causeTypes: ALL_CAUSES,
    recoverability: 'persistent',
    narrationGuidance:
      'Steering or control linkages are damaged, slowing turns while feedback and restraint forces injure the pilot.',
  },
  {
    id: 'fortress-drive-damage',
    label: 'Damaged drive assembly',
    bodyArea: 'fortress-drive',
    severity: 'severe',
    effects: ['drive-impaired', 'pilot-trauma'],
    ownerTypes: ['moving-fortress'],
    causeTypes: ALL_CAUSES,
    recoverability: 'persistent',
    narrationGuidance:
      'A wheel, axle, tread, or drive mechanism fails, reducing movement and battering the pilot through the cradle.',
  },
  {
    id: 'fortress-weapon-rupture',
    label: 'Ruptured weapon system',
    bodyArea: 'fortress-weapons',
    severity: 'severe',
    effects: ['weapon-system-impaired', 'pilot-trauma'],
    ownerTypes: ['moving-fortress'],
    causeTypes: ALL_CAUSES,
    recoverability: 'persistent',
    narrationGuidance:
      'A cannon, magic-round gun, feed, or firing conduit is damaged and its feedback injures the pilot.',
  },
  {
    id: 'fortress-restraint-failure',
    label: 'Cradle restraint failure',
    bodyArea: 'fortress-cradle',
    severity: 'critical',
    effects: ['cradle-restraint-failure', 'pilot-trauma', 'persistent-pain'],
    ownerTypes: ['moving-fortress'],
    causeTypes: ALL_CAUSES,
    recoverability: 'persistent',
    narrationGuidance:
      'Command-cradle restraints snap or buckle, throwing and injuring the sole embedded pilot inside the machine.',
  },
  {
    id: 'fortress-life-support-instability',
    label: 'Life-support instability',
    bodyArea: 'fortress-life-support',
    severity: 'critical',
    effects: ['life-support-strain', 'pilot-trauma'],
    ownerTypes: ['moving-fortress'],
    causeTypes: ['victim-retaliation', 'self-inflicted-strain'],
    recoverability: 'persistent',
    narrationGuidance:
      'The life-supporting core becomes unstable. The pilot cannot leave the Fortress and remains alive but endangered.',
  },
] as const satisfies readonly WoundCatalogEntry[];

export const WOUND_CATALOG_IDS = WOUND_CATALOG.map((entry) => entry.id) as [
  string,
  ...string[],
];

export type WoundCatalogId = (typeof WOUND_CATALOG)[number]['id'];

export function woundCatalogEntry(id: string): WoundCatalogEntry | undefined {
  return WOUND_CATALOG.find((entry) => entry.id === id);
}

export function eligibleWoundCatalogEntries(
  ownerType: FantasyPieceType,
  causeType: WoundCauseType,
  sourceRole?: string,
): WoundCatalogEntry[] {
  const compatible: WoundCatalogEntry[] = WOUND_CATALOG.filter(
    (catalogEntry) => {
      const entry: WoundCatalogEntry = catalogEntry;
      return (
        entry.ownerTypes.includes(ownerType) &&
        entry.causeTypes.includes(causeType)
      );
    },
  );
  const sourceSpecific = compatible.filter((entry) =>
    entry.sourceRoles?.includes(sourceRole ?? ''),
  );
  return sourceSpecific.length > 0
    ? sourceSpecific
    : compatible.filter((entry) => !entry.sourceRoles?.length);
}
