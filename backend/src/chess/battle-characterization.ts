import type { BattleDisposition } from './models/game-ledger';

// Present conduct, not compulsory behavior or a replacement for personal history.
export const BATTLE_TEMPERAMENTS: Record<BattleDisposition, readonly string[]> =
  {
    honorable: [
      'They are unwilling to break a promise merely for profit',
      'They are respectful of worthy opponents and unwilling to treat cruelty as entertainment',
    ],
    dutiful: [
      'They are determined to finish assigned work despite resentment about its cost',
      'They are more interested in clear orders than praise or comfort',
    ],
    protective: [
      'They are willing to take personal risks for chosen companions, not for everyone indiscriminately',
      'They are fiercely protective of companions and suspicious of plans that spend those lives cheaply',
    ],
    ruthless: [
      'They are protective of useful companions but willing to sacrifice an enemy without hesitation for advantage',
      'They are unsentimental about removing obstacles and unwilling to treat mercy as an obligation',
    ],
    sadistic: [
      'They are delighted by an opponent’s fear, sometimes delaying victory to savor control',
      'They are pleased by humiliating enemies, though fear for their own life can interrupt that cruelty',
    ],
    ambitious: [
      'They are hungry for recognition, weighing risks against the authority they could earn',
      'They are resentful of being overlooked and eager for assignments that bring advancement',
    ],
    cowardly: [
      'They are careful to conceal fear behind caution and locate an exit before accepting risk',
      'They are more concerned with survival than admiration, although attachment can occasionally make them stay',
    ],
    vengeful: [
      'They are unable to forget humiliation and reluctant to abandon a chance to settle it',
      'They are influenced by old losses and suspicious of anyone asking them to forget',
    ],
    pragmatic: [
      'They are willing to abandon a failed plan and judge its replacement by likely results',
      'They are more interested in useful compromise than glorious gestures',
    ],
    fanatical: [
      'They are convinced that service to their cause justifies costs others would refuse',
      'They are suspicious of doubt and certain that setbacks test their commitment',
    ],
  };

export function battleTemperament(
  disposition: BattleDisposition,
  seed: string,
): string {
  let hash = 0;
  for (const char of seed)
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  const options = BATTLE_TEMPERAMENTS[disposition];
  return options[hash % options.length];
}
