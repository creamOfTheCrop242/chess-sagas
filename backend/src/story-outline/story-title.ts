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
