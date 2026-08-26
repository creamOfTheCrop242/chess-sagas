import type {
  ChessEvent,
  FantasyPieceType,
  GameLedger,
  PieceIdentity,
} from '../chess/models/game-ledger';
import {
  eligibleWoundCatalogEntries,
  type WoundCatalogId,
} from './wound-catalog';

export interface RequiredWoundEvent {
  pieceId: string;
  inflictedAtPly: number;
  capturedPieceId: string;
  capturedPieceType: FantasyPieceType;
  causeType: WoundCauseType;
  sourcePieceId: string | null;
  woundCatalogId: WoundCatalogId;
  woundCatalog: {
    label: string;
    bodyArea: string;
    severity: string;
    effects: readonly string[];
    recoverability: string;
    narrationGuidance: string;
  };
}

export const WOUND_CAUSE_TYPES = [
  'victim-retaliation',
  'environmental-hazard',
  'self-inflicted-strain',
] as const;
export type WoundCauseType = (typeof WOUND_CAUSE_TYPES)[number];

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
  const pieces = new Map(ledger.pieces.map((piece) => [piece.id, piece]));
  const eligibleEvents = ledger.events
    .filter(
      (
        event,
      ): event is ChessEvent & {
        capturedPieceId: string;
        capturedPieceType: FantasyPieceType;
      } =>
        event.isCapture &&
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
    });

  const usedCatalogIdsByPiece = new Map<string, Set<string>>();
  return eligibleEvents.map((event) => {
    const causeType = selectWoundCause(ledger, event);
    const attacker = pieces.get(event.pieceId);
    if (!attacker) {
      throw new Error(`Cannot select wound for unknown piece ${event.pieceId}`);
    }
    const compatible = eligibleWoundCatalogEntries(
      attacker.fantasyType,
      causeType,
      causeType === 'victim-retaliation'
        ? pieces.get(event.capturedPieceId)?.viewpointRole
        : undefined,
    );
    if (compatible.length === 0) {
      throw new Error(
        `No wound catalog entry supports ${attacker.fantasyType}/${causeType}`,
      );
    }
    const used = usedCatalogIdsByPiece.get(event.pieceId) ?? new Set<string>();
    const unused = compatible.filter((entry) => !used.has(entry.id));
    const pool = unused.length > 0 ? unused : compatible;
    const roll = deterministicSeededRoll(ledger, event, 'wound-catalog');
    const selected =
      pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))];
    used.add(selected.id);
    usedCatalogIdsByPiece.set(event.pieceId, used);

    return {
      pieceId: event.pieceId,
      inflictedAtPly: event.ply,
      capturedPieceId: event.capturedPieceId,
      capturedPieceType: event.capturedPieceType,
      causeType,
      sourcePieceId:
        causeType === 'victim-retaliation' ? event.capturedPieceId : null,
      woundCatalogId: selected.id as WoundCatalogId,
      woundCatalog: {
        label: selected.label,
        bodyArea: selected.bodyArea,
        severity: selected.severity,
        effects: selected.effects,
        recoverability: selected.recoverability,
        narrationGuidance: selected.narrationGuidance,
      },
    };
  });
}

export function selectWoundCause(
  ledger: GameLedger,
  event: ChessEvent,
): WoundCauseType {
  const roll = deterministicSeededRoll(ledger, event, 'wound-cause');
  if (roll < 0.75) return 'victim-retaliation';
  if (roll < 0.9) return 'environmental-hazard';
  return 'self-inflicted-strain';
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
  return hashToUnitInterval(seed);
}

function deterministicSeededRoll(
  ledger: GameLedger,
  event: ChessEvent,
  purpose: string,
  extra: string[] = [],
): number {
  const seed = [
    purpose,
    ledger.metadata.date ?? '',
    ledger.metadata.whitePlayer,
    ledger.metadata.blackPlayer,
    ledger.events.map((candidate) => candidate.san).join(' '),
    event.ply,
    event.pieceId,
    event.capturedPieceId ?? '',
    ...extra,
  ].join('|');
  return hashToUnitInterval(seed);
}

function hashToUnitInterval(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}
