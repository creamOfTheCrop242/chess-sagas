import { createHash } from 'node:crypto';
import type { FantasyPieceType, GameLedger } from '../chess/models/game-ledger';

const OUTCOME_SPOILER =
  /\b(checkmate(?:d)?|mate|draw|stalemate|resign(?:ed|ation)?|surrender(?:ed)?|victor(?:y|ious)?|defeat(?:ed)?|winner|wins?|loss|seal[- ]breaking|sealfall)\b/i;
const BOARD_SQUARE = /(?:^|[^a-z0-9])[a-h][1-8](?:$|[^a-z0-9])/i;

const FALLBACK_BATTLE_TITLES = [
  'The Battle of the Ashen Road',
  'The Battle Beneath the Pale Wards',
  'The Battle of the Broken Causeway',
  'The Clash at Crownfire Field',
  'The Battle Under the Hollow Sky',
  'The War of the Rain-Black Banners',
  'The Battle of the Shattered Lanterns',
  'The Clash Beyond the Frostwall',
] as const;

const TITLE_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'beneath',
  'beyond',
  'clash',
  'of',
  'the',
  'under',
  'war',
  'battle',
]);

const DISTINCT_TITLE_FORMS = [
  'The Chronicle of {place}',
  'Ashes Along {place}',
  'Stormlight Over {place}',
  'The Iron March Through {place}',
  'Banners Beneath {place}',
  'The Sundering Near {place}',
  'The Last Muster at {place}',
  'Shadows Across {place}',
] as const;

const PIECE_TIER: Record<FantasyPieceType, number> = {
  grunt: 1,
  archwizard: 2,
  'knight-commander': 2,
  'moving-fortress': 3,
  queen: 4,
  king: 5,
};

export function isSpoilerFreeBattleTitle(title: string): boolean {
  const normalized = title.trim();
  return (
    normalized.length > 0 &&
    normalized.length <= 100 &&
    !OUTCOME_SPOILER.test(normalized) &&
    !BOARD_SQUARE.test(normalized)
  );
}

export function archiveBattleTitle(
  savedTitle: string | null | undefined,
  ledger: GameLedger | null | undefined,
  seed: string,
): string {
  if (savedTitle && isSpoilerFreeBattleTitle(savedTitle)) {
    return savedTitle;
  }

  const captureTitle = ledger ? titleForNotableCapture(ledger) : null;
  if (captureTitle) {
    return captureTitle;
  }

  const digest = createHash('sha256').update(seed).digest();
  return FALLBACK_BATTLE_TITLES[digest[0] % FALLBACK_BATTLE_TITLES.length];
}

export function titleSimilarity(left: string, right: string): number {
  const leftWords = significantTitleWords(left);
  const rightWords = significantTitleWords(right);
  if (leftWords.size === 0 || rightWords.size === 0) {
    return normalizeTitle(left) === normalizeTitle(right) ? 1 : 0;
  }
  const intersection = [...leftWords].filter((word) => rightWords.has(word));
  return intersection.length / Math.min(leftWords.size, rightWords.size);
}

export function isDistinctBattleTitle(
  candidate: string,
  existingTitles: readonly string[],
): boolean {
  const normalizedCandidate = normalizeTitle(candidate);
  return (
    isSpoilerFreeBattleTitle(candidate) &&
    existingTitles.every(
      (existing) =>
        normalizeTitle(existing) !== normalizedCandidate &&
        titleSimilarity(existing, candidate) < 0.75,
    )
  );
}

export function selectDistinctBattleTitle(
  candidates: readonly string[],
  existingTitles: readonly string[],
  environmentName: string,
  seed: string,
): string {
  const uniqueCandidates = [
    ...new Set(candidates.map((title) => title.trim())),
  ];
  const selected = uniqueCandidates.find((title) =>
    isDistinctBattleTitle(title, existingTitles),
  );
  if (selected) return selected;

  const place = environmentName.replace(/^The\s+/i, '');
  const digest = createHash('sha256').update(seed).digest();
  for (let offset = 0; offset < DISTINCT_TITLE_FORMS.length; offset += 1) {
    const form =
      DISTINCT_TITLE_FORMS[(digest[0] + offset) % DISTINCT_TITLE_FORMS.length];
    const fallback = form.replace('{place}', place);
    if (isDistinctBattleTitle(fallback, existingTitles)) return fallback;
  }

  const words = ['Ember', 'Ivory', 'Obsidian', 'Sable', 'Crimson', 'Silver'];
  const suffixes = ['Pilgrimage', 'Reckoning', 'Convergence', 'Vigil', 'March'];
  for (let offset = 0; offset < words.length * suffixes.length; offset += 1) {
    const word = words[(digest[1] + offset) % words.length];
    const suffix =
      suffixes[
        (digest[2] + Math.floor(offset / words.length)) % suffixes.length
      ];
    const fallback = `The ${word} ${suffix} of ${place}`;
    if (isDistinctBattleTitle(fallback, existingTitles)) return fallback;
  }

  const signature = createHash('sha256')
    .update(`title:${seed}:${existingTitles.length}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
  return `The Unnumbered Chronicle of ${place} ${signature}`;
}

export function canonicalTitleKey(title: string): string {
  return normalizeTitle(title);
}

function significantTitleWords(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(' ')
      .filter((word) => word.length > 1 && !TITLE_STOP_WORDS.has(word)),
  );
}

function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function titleForNotableCapture(ledger: GameLedger): string | null {
  const pieces = new Map(ledger.pieces.map((piece) => [piece.id, piece]));
  const finalPly = ledger.events.length;
  const candidates = ledger.events
    .filter(
      (event) =>
        event.isCapture &&
        event.ply < finalPly &&
        event.capturedPieceId &&
        event.capturedPieceType,
    )
    .map((event) => ({
      event,
      attackerTier: PIECE_TIER[event.pieceType],
      victimTier: PIECE_TIER[event.capturedPieceType!],
    }))
    .filter(({ attackerTier, victimTier }) => victimTier > attackerTier)
    .sort(
      (left, right) =>
        right.victimTier -
          right.attackerTier -
          (left.victimTier - left.attackerTier) ||
        right.victimTier - left.victimTier ||
        left.event.ply - right.event.ply,
    );
  const notable = candidates[0];
  if (!notable) {
    return null;
  }

  const attacker = pieces.get(notable.event.pieceId);
  const victim = pieces.get(notable.event.capturedPieceId!);
  const attackerRole = battleRole(
    attacker?.fantasyType ?? notable.event.pieceType,
  );
  const victimRole = battleRole(
    victim?.fantasyType ?? notable.event.capturedPieceType!,
  );
  return `The Battle of the ${attackerRole} and the ${victimRole}`;
}

function battleRole(type: FantasyPieceType): string {
  switch (type) {
    case 'grunt':
      return 'Soldier';
    case 'archwizard':
      return 'Archwizard';
    case 'moving-fortress':
      return 'Iron Fortress';
    case 'knight-commander':
      return 'Knight Commander';
    case 'queen':
      return 'Iron Queen';
    case 'king':
      return 'Siphoning King';
  }
}
