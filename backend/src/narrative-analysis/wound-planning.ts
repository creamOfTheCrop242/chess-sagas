import type {
  ChessEvent,
  FantasyPieceType,
  GameLedger,
} from '../chess/models/game-ledger';

export interface RequiredWoundEvent {
  pieceId: string;
  inflictedAtPly: number;
  capturedPieceId: string;
  capturedPieceType: FantasyPieceType;
}

const CAPTURE_IMPORTANCE: Record<FantasyPieceType, number> = {
  king: 6,
  queen: 5,
  'moving-fortress': 4,
  archwizard: 3,
  'knight-commander': 3,
  grunt: 1,
};

export function selectRequiredWoundEvents(
  ledger: GameLedger,
  minimum = 2,
): RequiredWoundEvent[] {
  const survivors = new Set(ledger.survivors);
  const eligible = ledger.events
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
    .sort(
      (left, right) =>
        woundEventScore(right) - woundEventScore(left) || left.ply - right.ply,
    );
  const requiredCount = Math.min(minimum, eligible.length);
  const selected: typeof eligible = [];
  const selectedActors = new Set<string>();

  for (const event of eligible) {
    if (selected.length >= requiredCount) break;
    if (selectedActors.has(event.pieceId)) continue;
    selected.push(event);
    selectedActors.add(event.pieceId);
  }
  for (const event of eligible) {
    if (selected.length >= requiredCount) break;
    if (selected.includes(event)) continue;
    selected.push(event);
  }

  return selected
    .sort((left, right) => left.ply - right.ply)
    .map((event) => ({
      pieceId: event.pieceId,
      inflictedAtPly: event.ply,
      capturedPieceId: event.capturedPieceId,
      capturedPieceType: event.capturedPieceType,
    }));
}

function woundEventScore(
  event: ChessEvent & { capturedPieceType: FantasyPieceType },
): number {
  return (
    CAPTURE_IMPORTANCE[event.capturedPieceType] * 10 +
    (event.isCheck ? 4 : 0) +
    (event.isCheckmate ? 6 : 0)
  );
}
