import type {
  ChessEvent,
  FantasyPieceType,
  GameLedger,
  PieceIdentity,
} from '../chess/models/game-ledger';

export interface RequiredWoundEvent {
  pieceId: string;
  inflictedAtPly: number;
  capturedPieceId: string;
  capturedPieceType: FantasyPieceType;
}

const COMBAT_TIER: Record<FantasyPieceType, number> = {
  king: 5,
  queen: 4,
  'moving-fortress': 3,
  archwizard: 2,
  'knight-commander': 2,
  grunt: 1,
};

export function selectRequiredWoundEvents(
  ledger: GameLedger,
): RequiredWoundEvent[] {
  const survivors = new Set(ledger.survivors);
  const pieces = new Map(ledger.pieces.map((piece) => [piece.id, piece]));
  return ledger.events
    .filter(
      (
        event,
      ): event is ChessEvent & {
        capturedPieceId: string;
        capturedPieceType: FantasyPieceType;
      } =>
        event.isCapture &&
        survivors.has(event.pieceId) &&
        Boolean(event.capturedPieceId) &&
        Boolean(event.capturedPieceType),
    )
    .filter((event) => {
      const attacker = pieces.get(event.pieceId);
      const victim = pieces.get(event.capturedPieceId);
      return (
        deterministicWoundRoll(ledger, event, attacker, victim) <
        woundProbability(event.pieceType, event.capturedPieceType)
      );
    })
    .map((event) => ({
      pieceId: event.pieceId,
      inflictedAtPly: event.ply,
      capturedPieceId: event.capturedPieceId,
      capturedPieceType: event.capturedPieceType,
    }));
}

export function woundProbability(
  attacker: FantasyPieceType,
  victim: FantasyPieceType,
): number {
  const tierDifference = COMBAT_TIER[victim] - COMBAT_TIER[attacker];
  if (tierDifference >= 3) return 0.9;
  if (tierDifference === 2) return 0.75;
  if (tierDifference === 1) return 0.6;
  if (tierDifference === 0) return 0.4;
  if (tierDifference === -1) return 0.2;
  return 0.08;
}

export function deterministicWoundRoll(
  ledger: GameLedger,
  event: ChessEvent,
  attacker?: PieceIdentity,
  victim?: PieceIdentity,
): number {
  const seed = [
    ledger.metadata.date ?? '',
    ledger.metadata.whitePlayer,
    ledger.metadata.blackPlayer,
    ledger.events.map((candidate) => candidate.san).join(' '),
    event.ply,
    event.pieceId,
    attacker?.permanentName ?? '',
    event.capturedPieceId ?? '',
    victim?.permanentName ?? '',
  ].join('|');
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}
