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

export const ENDING_GENRES = [
  'magical-catastrophe',
  'supernatural-horror',
  'personal-tragedy',
  'environmental-ruin',
  'military-collapse',
  'rebellion',
  'political-horror',
  'uneasy-survival',
] as const;

const ENDING_GENRE_WEIGHTS: ReadonlyArray<
  readonly [genre: EndingGenre, cumulativeWeight: number]
> = [
  ['magical-catastrophe', 20],
  ['supernatural-horror', 40],
  ['personal-tragedy', 55],
  ['environmental-ruin', 70],
  ['military-collapse', 80],
  ['rebellion', 90],
  ['political-horror', 95],
  ['uneasy-survival', 100],
];

const GENRE_AFTERMATH_FOCUSES: Record<
  EndingGenre,
  readonly AftermathFocus[]
> = {
  'magical-catastrophe': [
    'survivor-grief-and-personal-reckoning',
    'wounded-veterans-and-memorial-rites',
    'the-battlefields-environmental-transformation',
  ],
  'supernatural-horror': [
    'survivor-grief-and-personal-reckoning',
    'wounded-veterans-and-memorial-rites',
    'the-battlefields-environmental-transformation',
  ],
  'personal-tragedy': [
    'survivor-grief-and-personal-reckoning',
    'prisoners-reconciliation-and-revenge',
    'wounded-veterans-and-memorial-rites',
    'disbanded-armies-and-returning-soldiers',
  ],
  'environmental-ruin': [
    'civilian-survival-and-reconstruction',
    'disbanded-armies-and-returning-soldiers',
    'the-battlefields-environmental-transformation',
  ],
  'military-collapse': [
    'prisoners-reconciliation-and-revenge',
    'wounded-veterans-and-memorial-rites',
    'disbanded-armies-and-returning-soldiers',
  ],
  rebellion: [
    'political-succession-and-accountability',
    'civilian-survival-and-reconstruction',
    'prisoners-reconciliation-and-revenge',
    'occupation-and-the-victors-burden',
  ],
  'political-horror': [
    'political-succession-and-accountability',
    'prisoners-reconciliation-and-revenge',
    'occupation-and-the-victors-burden',
  ],
  'uneasy-survival': [
    'survivor-grief-and-personal-reckoning',
    'civilian-survival-and-reconstruction',
    'wounded-veterans-and-memorial-rites',
    'disbanded-armies-and-returning-soldiers',
    'the-battlefields-environmental-transformation',
  ],
};

const GENRE_LATER_CHRONICLE_LENSES: Record<
  EndingGenre,
  readonly LaterChronicleLens[]
> = {
  'magical-catastrophe': [
    'the-landscape-preserving-the-wars-scars',
    'a-scavenger-misunderstanding-a-dangerous-discovery',
    'craftspeople-repurposing-weapons-and-relics',
  ],
  'supernatural-horror': [
    'a-descendant-inheriting-an-unwanted-legacy',
    'a-pilgrim-visiting-a-contested-memorial',
    'an-exile-returning-to-a-changed-homeland',
    'a-scavenger-misunderstanding-a-dangerous-discovery',
  ],
  'personal-tragedy': [
    'a-descendant-inheriting-an-unwanted-legacy',
    'an-exile-returning-to-a-changed-homeland',
    'survivors-relationship-echoing-across-a-generation',
    'a-pilgrim-visiting-a-contested-memorial',
  ],
  'environmental-ruin': [
    'a-settlement-built-over-the-battlefield',
    'an-exile-returning-to-a-changed-homeland',
    'the-landscape-preserving-the-wars-scars',
    'a-scavenger-misunderstanding-a-dangerous-discovery',
  ],
  'military-collapse': [
    'a-descendant-inheriting-an-unwanted-legacy',
    'an-exile-returning-to-a-changed-homeland',
    'craftspeople-repurposing-weapons-and-relics',
    'survivors-relationship-echoing-across-a-generation',
  ],
  rebellion: [
    'a-descendant-inheriting-an-unwanted-legacy',
    'a-historian-disputing-the-official-account',
    'a-settlement-built-over-the-battlefield',
    'an-exile-returning-to-a-changed-homeland',
  ],
  'political-horror': [
    'a-descendant-inheriting-an-unwanted-legacy',
    'a-historian-disputing-the-official-account',
    'a-pilgrim-visiting-a-contested-memorial',
    'a-folk-tradition-distorting-the-battles-memory',
  ],
  'uneasy-survival': [
    'a-descendant-inheriting-an-unwanted-legacy',
    'a-settlement-built-over-the-battlefield',
    'an-exile-returning-to-a-changed-homeland',
    'craftspeople-repurposing-weapons-and-relics',
    'the-landscape-preserving-the-wars-scars',
    'a-scavenger-misunderstanding-a-dangerous-discovery',
  ],
};

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
export type EndingGenre = (typeof ENDING_GENRES)[number];
export type DestroyedSealConsequence =
  (typeof DESTROYED_SEAL_CONSEQUENCES)[number];
export type IntactSealConsequence = (typeof INTACT_SEAL_CONSEQUENCES)[number];
export type DarkEndingConsequence =
  DestroyedSealConsequence | IntactSealConsequence;

const GENRE_DESTROYED_SEAL_CONSEQUENCES: Record<
  EndingGenre,
  readonly DestroyedSealConsequence[]
> = {
  'magical-catastrophe': [
    'realm-magic-detonation-threatening-both-kingdoms',
    'devouring-void-consuming-the-defeated-capital',
    'reality-fracture-scattering-survivors-across-worlds',
    'time-wound-trapping-the-battlefield-in-repeating-moments',
    'magical-contamination-transforming-land-and-survivors',
  ],
  'supernatural-horror': [
    'ancient-being-released-from-seal-imprisonment',
    'foreign-power-crossing-the-severed-universal-bridge',
    'the-dead-speaking-through-extinguished-wards',
    'dangerous-relic-surviving-with-an-unknown-purpose',
  ],
  'personal-tragedy': [
    'the-dead-speaking-through-extinguished-wards',
    'victorious-seal-absorbing-the-collapse-and-corrupting-its-king',
    'dangerous-relic-surviving-with-an-unknown-purpose',
  ],
  'environmental-ruin': [
    'devouring-void-consuming-the-defeated-capital',
    'reality-fracture-scattering-survivors-across-worlds',
    'time-wound-trapping-the-battlefield-in-repeating-moments',
    'magical-contamination-transforming-land-and-survivors',
  ],
  'military-collapse': [
    'foreign-power-crossing-the-severed-universal-bridge',
    'surviving-character-leading-an-uprising-against-the-victor',
    'victorious-seal-absorbing-the-collapse-and-corrupting-its-king',
  ],
  rebellion: [
    'surviving-character-leading-an-uprising-against-the-victor',
    'civilian-third-power-rising-against-both-crowns',
  ],
  'political-horror': [
    'surviving-character-leading-an-uprising-against-the-victor',
    'victorious-seal-absorbing-the-collapse-and-corrupting-its-king',
    'civilian-third-power-rising-against-both-crowns',
  ],
  'uneasy-survival': [
    'reality-fracture-scattering-survivors-across-worlds',
    'magical-contamination-transforming-land-and-survivors',
    'the-dead-speaking-through-extinguished-wards',
    'dangerous-relic-surviving-with-an-unknown-purpose',
  ],
};

const GENRE_INTACT_SEAL_CONSEQUENCES: Record<
  EndingGenre,
  readonly IntactSealConsequence[]
> = {
  'magical-catastrophe': [
    'reality-fracture-opening-along-the-final-battlefield',
    'children-inheriting-memories-from-other-fractured-realities',
  ],
  'supernatural-horror': [
    'ancient-being-drawn-to-the-strained-but-living-seals',
    'surviving-seal-slowly-corrupting-its-king',
    'dangerous-relic-being-stolen-or-awakened',
    'children-inheriting-memories-from-other-fractured-realities',
  ],
  'personal-tragedy': [
    'victorious-queen-challenging-her-kings-rule',
    'surviving-seal-slowly-corrupting-its-king',
    'children-inheriting-memories-from-other-fractured-realities',
  ],
  'environmental-ruin': [
    'reality-fracture-opening-along-the-final-battlefield',
    'dangerous-relic-being-stolen-or-awakened',
  ],
  'military-collapse': [
    'defeated-kingdom-reorganizing-beneath-a-hidden-leader',
    'occupation-hardening-the-victor-into-a-harsher-regime',
    'surviving-seal-slowly-corrupting-its-king',
  ],
  rebellion: [
    'surviving-character-leading-an-uprising-against-the-victor',
    'defeated-kingdom-reorganizing-beneath-a-hidden-leader',
    'victorious-queen-challenging-her-kings-rule',
    'civilian-third-power-rising-against-both-crowns',
  ],
  'political-horror': [
    'defeated-kingdom-reorganizing-beneath-a-hidden-leader',
    'victorious-queen-challenging-her-kings-rule',
    'occupation-hardening-the-victor-into-a-harsher-regime',
    'civilian-third-power-rising-against-both-crowns',
    'surviving-seal-slowly-corrupting-its-king',
  ],
  'uneasy-survival': [
    'defeated-kingdom-reorganizing-beneath-a-hidden-leader',
    'ancient-being-drawn-to-the-strained-but-living-seals',
    'reality-fracture-opening-along-the-final-battlefield',
    'dangerous-relic-being-stolen-or-awakened',
    'children-inheriting-memories-from-other-fractured-realities',
  ],
};

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
    endingGenre: EndingGenre;
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
  const variationSource = [
    ledger.metadata.date ?? '',
    ledger.metadata.whitePlayer,
    ledger.metadata.blackPlayer,
    ledger.events.map((event) => event.san).join(' '),
  ].join('|');
  const variationSeed = stableHash(variationSource);
  const endingGenre = selectEndingGenre(
    stableHash(`ending-genre|${variationSource}`),
  );
  const aftermathFocuses = GENRE_AFTERMATH_FOCUSES[endingGenre];
  const laterChronicleLenses = GENRE_LATER_CHRONICLE_LENSES[endingGenre];
  const destroyedSealConsequences =
    GENRE_DESTROYED_SEAL_CONSEQUENCES[endingGenre];
  const intactSealConsequences = GENRE_INTACT_SEAL_CONSEQUENCES[endingGenre];

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
      aftermathFocus: selectSeeded(
        aftermathFocuses,
        stableHash(`aftermath-focus|${variationSource}`),
      ),
      laterChronicleLens: selectSeeded(
        laterChronicleLenses,
        stableHash(`later-chronicle-lens|${variationSource}`),
      ),
      endingGenre,
      laterChronicleCliffhanger:
        Math.floor(
          variationSeed /
            (AFTERMATH_FOCUSES.length * LATER_CHRONICLE_LENSES.length),
        ) %
          4 ===
        0,
      destroyedSealConsequence: selectSeeded(
        destroyedSealConsequences,
        stableHash(`destroyed-seal-consequence|${variationSource}`),
      ),
      intactSealConsequence: selectSeeded(
        intactSealConsequences,
        stableHash(`intact-seal-consequence|${variationSource}`),
      ),
    },
  };
}

function selectSeeded<const T>(values: readonly T[], seed: number): T {
  return values[(seed >>> 0) % values.length];
}

export function selectEndingGenre(seed: number): EndingGenre {
  const roll = (seed >>> 0) % 100;
  return (
    ENDING_GENRE_WEIGHTS.find(
      ([, cumulativeWeight]) => roll < cumulativeWeight,
    )?.[0] ?? 'uneasy-survival'
  );
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
