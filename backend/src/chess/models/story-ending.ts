export const SURRENDER_KING_FATES = [
  'breaks-seal-and-accepts-captivity',
  'abandons-seal-and-flees',
  'refuses-seal-destruction-and-is-imprisoned',
  'shatters-seal-in-defiance',
  'spends-seal-to-save-subjects',
  'executed-after-rejected-surrender',
] as const;

export const DEFEATED_KING_FATES = [
  'killed-after-checkmate',
  ...SURRENDER_KING_FATES,
  'survives',
] as const;

export type DefeatedKingFate = (typeof DEFEATED_KING_FATES)[number];

export function isSurrenderKingFate(
  fate: string,
): fate is (typeof SURRENDER_KING_FATES)[number] {
  return (SURRENDER_KING_FATES as readonly string[]).includes(fate);
}

export function kingDiesFromFate(fate: DefeatedKingFate): boolean {
  return (
    fate === 'killed-after-checkmate' ||
    fate === 'executed-after-rejected-surrender'
  );
}

export function sealFateForKingFate(
  fate: DefeatedKingFate,
): 'destroyed' | 'intact' {
  return fate === 'survives' ||
    fate === 'refuses-seal-destruction-and-is-imprisoned'
    ? 'intact'
    : 'destroyed';
}
