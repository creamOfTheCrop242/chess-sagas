import type { GameLedger, Side } from '../chess/models/game-ledger';

export const AFTERMATH_FOCUSES = [
  'survivor-grief-and-personal-reckoning',
  'political-succession-and-accountability',
  'civilian-survival-and-reconstruction',
  'prisoners-reconciliation-and-revenge',
  'wounded-veterans-and-memorial-rites',
  'occupation-and-the-victors-burden',
  'disbanded-armies-and-returning-soldiers',
  'the-battlefields-environmental-transformation',
] as const;

export const LATER_CHRONICLE_LENSES = [
  'a-descendant-inheriting-an-unwanted-legacy',
  'a-historian-disputing-the-official-account',
  'a-settlement-built-over-the-battlefield',
  'a-pilgrim-visiting-a-contested-memorial',
  'an-exile-returning-to-a-changed-homeland',
  'craftspeople-repurposing-weapons-and-relics',
  'survivors-relationship-echoing-across-a-generation',
  'the-landscape-preserving-the-wars-scars',
  'a-folk-tradition-distorting-the-battles-memory',
  'a-scavenger-misunderstanding-a-dangerous-discovery',
] as const;

export const DESTROYED_SEAL_CONSEQUENCES = [
  'realm-magic-detonation-threatening-both-kingdoms',
  'devouring-void-consuming-the-defeated-capital',
  'ancient-being-released-from-seal-imprisonment',
  'foreign-power-crossing-the-severed-universal-bridge',
  'reality-fracture-scattering-survivors-across-worlds',
  'time-wound-trapping-the-battlefield-in-repeating-moments',
  'magical-contamination-transforming-land-and-survivors',
  'the-dead-speaking-through-extinguished-wards',
  'surviving-character-leading-an-uprising-against-the-victor',
  'victorious-seal-absorbing-the-collapse-and-corrupting-its-king',
  'civilian-third-power-rising-against-both-crowns',
  'dangerous-relic-surviving-with-an-unknown-purpose',
] as const;

export const INTACT_SEAL_CONSEQUENCES = [
  'surviving-character-leading-an-uprising-against-the-victor',
  'defeated-kingdom-reorganizing-beneath-a-hidden-leader',
  'victorious-queen-challenging-her-kings-rule',
  'occupation-hardening-the-victor-into-a-harsher-regime',
  'civilian-third-power-rising-against-both-crowns',
  'ancient-being-drawn-to-the-strained-but-living-seals',
  'surviving-seal-slowly-corrupting-its-king',
  'reality-fracture-opening-along-the-final-battlefield',
  'dangerous-relic-being-stolen-or-awakened',
  'children-inheriting-memories-from-other-fractured-realities',
] as const;

export type AftermathFocus = (typeof AFTERMATH_FOCUSES)[number];
export type LaterChronicleLens = (typeof LATER_CHRONICLE_LENSES)[number];
export type DestroyedSealConsequence =
  (typeof DESTROYED_SEAL_CONSEQUENCES)[number];
export type IntactSealConsequence = (typeof INTACT_SEAL_CONSEQUENCES)[number];
export type DarkEndingConsequence =
  DestroyedSealConsequence | IntactSealConsequence;

export interface EndingContract {
  result: GameLedger['metadata']['result'];
  winner: Side | 'draw' | 'undecided';
  loser: Side | null;
  termination: GameLedger['metadata']['termination'];
  finalMove: string | null;
  finalPositionIsCheck: boolean;
  finalPositionIsCheckmate: boolean;
  resigningSide: Side | null;
  creativeDirection: {
    aftermathFocus: AftermathFocus;
    laterChronicleLens: LaterChronicleLens;
    laterChronicleCliffhanger: boolean;
    destroyedSealConsequence: DestroyedSealConsequence;
    intactSealConsequence: IntactSealConsequence;
  };
}

export function buildEndingContract(ledger: GameLedger): EndingContract {
  const winner =
    ledger.metadata.result === '1-0'
      ? 'north'
      : ledger.metadata.result === '0-1'
        ? 'south'
        : ledger.metadata.result === '1/2-1/2'
          ? 'draw'
          : 'undecided';
  const loser =
    winner === 'north' ? 'south' : winner === 'south' ? 'north' : null;
  const finalEvent = ledger.events.at(-1);
  const variationSeed = stableHash(
    [
      ledger.metadata.date ?? '',
      ledger.metadata.whitePlayer,
      ledger.metadata.blackPlayer,
      ledger.events.map((event) => event.san).join(' '),
    ].join('|'),
  );
  const consequenceDivisor =
    AFTERMATH_FOCUSES.length * LATER_CHRONICLE_LENSES.length * 4;

  return {
    result: ledger.metadata.result,
    winner,
    loser,
    termination: ledger.metadata.termination,
    finalMove: finalEvent?.san ?? null,
    finalPositionIsCheck: finalEvent?.isCheck ?? false,
    finalPositionIsCheckmate: finalEvent?.isCheckmate ?? false,
    resigningSide: ledger.metadata.termination === 'resignation' ? loser : null,
    creativeDirection: {
      aftermathFocus:
        AFTERMATH_FOCUSES[variationSeed % AFTERMATH_FOCUSES.length],
      laterChronicleLens:
        LATER_CHRONICLE_LENSES[
          Math.floor(variationSeed / AFTERMATH_FOCUSES.length) %
            LATER_CHRONICLE_LENSES.length
        ],
      laterChronicleCliffhanger:
        Math.floor(
          variationSeed /
            (AFTERMATH_FOCUSES.length * LATER_CHRONICLE_LENSES.length),
        ) %
          4 ===
        0,
      destroyedSealConsequence:
        DESTROYED_SEAL_CONSEQUENCES[
          Math.floor(variationSeed / consequenceDivisor) %
            DESTROYED_SEAL_CONSEQUENCES.length
        ],
      intactSealConsequence:
        INTACT_SEAL_CONSEQUENCES[
          Math.floor(
            variationSeed /
              (consequenceDivisor * DESTROYED_SEAL_CONSEQUENCES.length),
          ) % INTACT_SEAL_CONSEQUENCES.length
        ],
    },
  };
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
