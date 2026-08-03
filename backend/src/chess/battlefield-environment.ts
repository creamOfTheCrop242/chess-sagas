import type { GameLedger } from './models/game-ledger';

export const BATTLEFIELD_ENVIRONMENTS = [
  {
    id: 'frozen-pass',
    name: 'The Frostbound Pass',
    description:
      'A narrow mountain road between ice cliffs, abandoned watchtowers, and avalanche slopes under relentless snow.',
  },
  {
    id: 'ashen-caldera',
    name: 'The Ashen Caldera',
    description:
      'A volcanic basin of black glass, smoking fissures, ruined forges, and drifting ash beneath a red horizon.',
  },
  {
    id: 'drowned-city',
    name: 'The Drowned City',
    description:
      'Flooded streets, leaning towers, half-submerged plazas, and broken bridges churn beneath cold rain.',
  },
  {
    id: 'elderwood',
    name: 'The Elderwood',
    description:
      'An ancient forest of colossal roots, luminous fog, overgrown shrines, and paths that close behind marching armies.',
  },
  {
    id: 'glass-desert',
    name: 'The Shattered Glass Desert',
    description:
      'A wind-scoured waste of mirrored dunes, buried ruins, razor storms, and heat that bends distant armies into ghosts.',
  },
  {
    id: 'storm-coast',
    name: 'The Stormwrack Coast',
    description:
      'Sea cliffs, tidal causeways, shattered harbor walls, and salt-lashed fortifications beneath a violent storm.',
  },
  {
    id: 'underkingdom',
    name: 'The Hollow Kingdom',
    description:
      'A buried realm of cathedral caverns, crystal bridges, bottomless chasms, and failing artificial suns.',
  },
  {
    id: 'dead-magic-marsh',
    name: 'The Mire of Dead Magic',
    description:
      'A drowned marsh where ruined ward-stones, corpse lights, sinking roads, and magic-starved reeds conceal every approach.',
  },
  {
    id: 'fallen-capital',
    name: 'The Fallen Capital',
    description:
      'A devastated imperial city of broad avenues, collapsed palaces, barricaded districts, and monuments split by old magic.',
  },
  {
    id: 'sky-islands',
    name: 'The Broken Skylands',
    description:
      'Fractured islands hang above a cloud abyss, joined by failing bridges, gravity-scarred ruins, and streams that fall into open sky.',
  },
  {
    id: 'iron-road',
    name: 'The Iron Road',
    description:
      'A fortified trade road crosses bleak moorland through siege gates, drainage trenches, milestone shrines, and rusting war machinery.',
  },
  {
    id: 'sunken-temple-valley',
    name: 'The Valley of Sunken Temples',
    description:
      'Jungle-choked sanctuaries rise from terraced wetlands amid monsoon rain, vine bridges, and ancient channels carrying unstable magic.',
  },
  {
    id: 'bone-steppe',
    name: 'The Pale Steppe',
    description:
      'Endless grassland rolls around the fossil ribs of forgotten giants, wind-carved burial mounds, and isolated stone redoubts.',
  },
  {
    id: 'crystal-canyon',
    name: 'The Resonant Canyons',
    description:
      'A maze of crystal ravines multiplies light, footsteps, spellfire, and shouted orders into dangerous echoes.',
  },
  {
    id: 'harvest-valley',
    name: 'The Last Harvest Valley',
    description:
      'Farms, orchards, millstreams, and crowded villages lie between the armies, turning every advance into a choice between victory and ruin.',
  },
  {
    id: 'moonlit-tundra',
    name: 'The Moonlit Tundra',
    description:
      'Blue ice plains, frozen rivers, aurora-lit ruins, and sparse black pines stretch beneath an unnaturally bright moon.',
  },
] as const;

export type BattlefieldEnvironment = (typeof BATTLEFIELD_ENVIRONMENTS)[number];

export function selectBattlefieldEnvironment(
  ledger: GameLedger,
): BattlefieldEnvironment {
  const seed = [
    ledger.metadata.date ?? '',
    ledger.metadata.whitePlayer,
    ledger.metadata.blackPlayer,
    ledger.metadata.result,
    ledger.events.map((event) => event.san).join(' '),
  ].join('|');
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return BATTLEFIELD_ENVIRONMENTS[
    (hash >>> 0) % BATTLEFIELD_ENVIRONMENTS.length
  ];
}
