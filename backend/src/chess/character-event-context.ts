import type { GameLedger } from './models/game-ledger';

/** Facts only. Proximity/outline membership never establishes a witness. */
export function buildCharacterEventContext(ledger: GameLedger) {
  return ledger.events.map((event) => ({
    ply: event.ply,
    moverId: event.pieceId,
    victimId: event.capturedPieceId ?? null,
    witnessIds:
      event.interactionContext?.witnessedCapture?.witnessPieceIds ?? [],
    isCheckmate: event.isCheckmate,
    isPromotion: event.isPromotion,
  }));
}

export function characterEventRole(
  event: ReturnType<typeof buildCharacterEventContext>[number],
  pieceId: string,
) {
  if (event.moverId === pieceId) return 'actor';
  if (event.victimId === pieceId) return 'victim';
  if (event.witnessIds.includes(pieceId)) return 'recorded-witness';
  return 'no-established-direct-involvement';
}
