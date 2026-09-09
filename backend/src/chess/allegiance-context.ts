import type {
  ChessPieceType,
  FantasyPieceType,
  GameLedger,
  Side,
} from './models/game-ledger';

const ROLES: Record<ChessPieceType, FantasyPieceType> = {
  p: 'grunt',
  n: 'knight-commander',
  b: 'archwizard',
  r: 'moving-fortress',
  q: 'queen',
  k: 'king',
};
const knownSide = (side: unknown): side is Side =>
  side === 'north' || side === 'south';

export function relationshipAllegiance(
  ledger: GameLedger,
  ids: string[],
  ply: number,
) {
  const participants = ids.map((pieceId) => {
    const piece = ledger.pieces.find((p) => p.id === pieceId);
    const promotion = ledger.events
      .filter((e) => e.pieceId === pieceId && e.isPromotion && e.ply <= ply)
      .sort((a, b) => b.ply - a.ply)[0];
    return {
      pieceId,
      side: knownSide(piece?.side) ? piece.side : null,
      role:
        promotion?.promotionType ??
        (piece ? (ROLES[piece.chessType] ?? null) : null),
    };
  });
  const affiliation =
    ids.length !== 2 ||
    new Set(ids).size !== 2 ||
    participants.some((p) => p.side === null)
      ? 'unknown'
      : participants[0].side === participants[1].side
        ? 'same-army'
        : 'opposing-armies';
  return {
    participants,
    affiliation,
    commandAuthority:
      affiliation === 'opposing-armies'
        ? 'no-shared-military-command'
        : 'not-established-by-allegiance-alone',
  };
}

export function buildAllegianceContext(
  ledger: GameLedger,
  plans: Array<{
    id: string;
    characterIds: string[];
    developmentPlies: number[];
  }> = [],
) {
  return {
    roster: ledger.pieces.map((p) => ({
      pieceId: p.id,
      side: knownSide(p.side) ? p.side : null,
      initialRole: ROLES[p.chessType] ?? null,
    })),
    // Explicitly author-only; role changes must never grant future knowledge.
    authorOnlyPromotionTimeline: ledger.events
      .filter((e) => e.isPromotion)
      .map((e) => ({
        ply: e.ply,
        pieceId: e.pieceId,
        role: e.promotionType,
      })),
    selectedRelationships: plans.flatMap((plan) =>
      [...new Set(plan.developmentPlies)]
        .filter(
          (ply) =>
            Number.isInteger(ply) && ply > 0 && ply <= ledger.events.length,
        )
        .sort((a, b) => a - b)
        .map((ply) => ({
          relationshipId: plan.id,
          ply,
          ...relationshipAllegiance(ledger, plan.characterIds, ply),
        })),
    ),
  };
}

export const ALLEGIANCE_INSTRUCTIONS = `
Allegiance and authority:
- allegianceContext and each relationshipSceneGuide entry's allegiance are derived from the chess ledger and take precedence over conflicting creative relationship framing. Same-army, opposing-armies, and unknown are distinct from proximity. nearbyAllies=false does not by itself identify an enemy.
- Same-army does not automatically establish a superior/subordinate relationship. Use established roles and command context; do not invent an obligation to obey from proximity, personality, or relationship labels. Opposing armies have no shared military command merely because one participant is a King or Queen.
- Preserve cross-army relationships: rivalry, respect, threats, taunts, surrender demands, negotiation, deliberate mercy, and established shared history are allowed. An enemy can demand surrender or try to manipulate a response. Refusing that demand is resistance, not insubordination; attacking an enemy is not betrayal of that enemy's command. Hostile cooperation requires an explicit contextual motive, never an accidental transfer of allegiance.
- If a prior plan frames an enemy as a subordinate, reinterpret that interaction as opposition, provocation, or an unsuccessful demand while preserving participants, timing, captures, wounds, and outcomes. Do not blindly dramatize the mistaken framing. If context is unknown, avoid assuming either authority or allegiance. These are generation instructions, not new blocking validations.
- Roles apply at the current ply. The author-only promotion timeline is not character knowledge: promotion preserves kingdom allegiance and cannot grant a future title, loyalty change, or command relationship before the event.
`;
